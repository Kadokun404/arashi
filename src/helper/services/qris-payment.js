/**
 * helper pembayaran QRIS GoPay.
 * semua konfigurasi dibaca dari config.js (QRIS_API_BASE, QRIS_API_TOKEN, QRIS_STORE_PROFILE),
 * jadi gak perlu .env lagi.
 *
 * @import {WASocket, WAMessage} from "baileys"
 */

import { config } from "#root/config.js"
import { Interactive } from "#helper/message/send-interactive.js"

export const MIN_AMOUNT = 1
export const MAX_AMOUNT = 5_000_000
export const POLL_INTERVAL_MS = 5000
export const EXPIRE_MS = 5 * 60 * 1000
export const DIV = "━━━━━━━━━━━━━━"

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const rupiah = (n) => "Rp" + Number(n).toLocaleString("id-ID")

export const nowLocal = () =>
    new Date().toLocaleString("id-ID", {
        timeZone: config.TIME_ZONE || "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZoneName: "short"
    })

/** total yang lagi dipakai / baru dipakai: total -> berlaku sampai (ms) */
const heldTotals = new Map()
// transaksi yang dibayar sampai 90 detik sebelum QR dibuat tetap dianggap cocok oleh gateway,
// jadi total ditahan lebih lama dari masa berlaku QR
const HOLD_MS = EXPIRE_MS + 120_000

/**
 * pilih total bayar = nominal + kode unik acak, yang belum dipakai pembayaran lain.
 * total yang terpilih langsung ditahan, panggil releaseTotal kalau QR gagal dibuat.
 * @param {number} base nominal asli
 * @returns {{total: number, code: number} | null} null kalau semua kode unik lagi terpakai
 */
export function pickTotal(base) {
    const now = Date.now()
    for (const [t, until] of heldTotals) if (until <= now) heldTotals.delete(t)

    const max = Math.max(0, Math.trunc(Number(config.QRIS_UNIQUE_CODE_MAX ?? 99)) || 0)
    const hi = Math.min(max, MAX_AMOUNT - base)
    const codes = hi >= 1 ? Array.from({ length: hi }, (_, i) => i + 1) : [0]
    for (let i = codes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [codes[i], codes[j]] = [codes[j], codes[i]]
    }

    const code = codes.find((c) => !heldTotals.has(base + c))
    if (code === undefined) return null
    heldTotals.set(base + code, now + HOLD_MS)
    return { total: base + code, code }
}

export const releaseTotal = (total) => heldTotals.delete(total)

/** true kalau QRIS_API_BASE dan QRIS_API_TOKEN sudah diisi di config.js */
export const isConfigured = () => Boolean(config.QRIS_API_BASE && config.QRIS_API_TOKEN)

/**
 * parse "2 kopi 15000, 1 roti 8000" jadi [{ nama, qty, harga }]
 * @param {string} str
 * @returns {{nama: string, qty: number, harga: number}[] | null}
 */
export function parseItems(str) {
    const segs = String(str || "").split(",").map((s) => s.trim()).filter(Boolean)
    if (!segs.length) return null
    const items = []
    for (const seg of segs) {
        const match = seg.match(/^(\d+)\s+(.+?)\s+(\d+)$/)
        if (!match) return null
        const qty = parseInt(match[1], 10)
        const nama = match[2].trim()
        const harga = parseInt(match[3], 10)
        if (!qty || !nama || !Number.isFinite(harga)) return null
        items.push({ nama, qty, harga })
    }
    return items
}

const baseUrl = () => String(config.QRIS_API_BASE || "").replace(/\/+$/, "")

export async function apiPost(path, body, timeoutMs = 25000) {
    const res = await fetch(`${baseUrl()}${path}`, {
        method: "POST",
        headers: { "x-internal-token": config.QRIS_API_TOKEN, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json()
}

export async function apiGet(path, params, timeoutMs = 15000) {
    const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    )
    const res = await fetch(`${baseUrl()}${path}?${qs}`, {
        headers: { "x-internal-token": config.QRIS_API_TOKEN },
        signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json()
}

/** minta server bikin struk (gambar png). return Buffer, atau null kalau gagal */
export async function buildStruk({ items, paidAmt, uniqueCode = 0, refNo, kasir, pelanggan }) {
    try {
        const json = await apiPost("/api/maker/struk", {
            toko: config.QRIS_STORE_PROFILE,
            items,
            paid: true,
            metodeBayar: "QRIS",
            bayar: paidAmt,
            uniqueCode,
            nomorStruk: String(refNo || ""),
            kasir,
            pelanggan
        }, 30000)
        return json?.ok && json.base64 ? Buffer.from(json.base64, "base64") : null
    } catch {
        return null
    }
}

/** batalin QRIS di server, bisa pakai { ref } atau { amount }. error diabaikan */
export async function gopayCancel(payload) {
    try {
        await apiPost("/api/gopay/cancel", payload, 10000)
    } catch { }
}

/**
 * hapus kartu pembayaran dari chat
 * @param {WASocket} sock
 * @param {string} jid
 * @param {{remoteJid: string, id: string, fromMe: boolean} | null} cardKey
 */
export async function deleteCard(sock, jid, cardKey) {
    if (!cardKey) return
    try {
        await sock.sendMessage(jid, { delete: { remoteJid: jid, id: cardKey.id, fromMe: true } })
    } catch { }
}

/**
 * kirim kartu pembayaran (gambar QR + teks + tombol Batal).
 * tombol Batal punya id "paycancel", yang dibaca bot sebagai command (lihat notify-handler)
 *
 * @param {WASocket} sock
 * @param {WAMessage} quoted
 * @param {string} jid
 * @param {Buffer} qrBuffer
 * @param {string} body
 * @param {string} footer
 * @returns {Promise<{remoteJid: string, id: string, fromMe: boolean} | null>}
 */
export async function sendPaymentCard(sock, quoted, jid, qrBuffer, body, footer) {
    const res = await new Interactive(sock)
        .setHeader({ image: qrBuffer })
        .setBody(body)
        .setFooter(footer)
        .addButtonQuickReply("Batal", "paycancel")
        .send(jid, { quoted })

    const id = typeof res === "string" ? res : (res?.key?.id ?? res?.id ?? null)
    return id ? { remoteJid: jid, id, fromMe: true } : null
}
