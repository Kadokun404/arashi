/**
 * Baca QR dari gambar lalu kirim isinya.
 *
 *   kirim foto QR + caption .readqr, atau reply foto QR dengan .readqr
 *
 * Kalau isinya QRIS (diawali 000201), hasilnya tampil sebagai kartu "Profile Bisnis": nama merchant,
 * kota, NMID, penyedia, tipe (statis/dinamis), nominal, dan cek CRC. Tombol "Salin" (cta_copy)
 * menyalin string QRIS mentahnya, mis. buat GOPAY_STATIC_QR di gateway.
 *
 * Butuh library `jsqr`: npm i jsqr  (sharp sudah ada di dependency bot)
 *
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import sharp from "sharp"
import { config } from "#root/config.js"
import { Interactive } from "#helper/sendInteractive.js"

const DIV = "━━━━━━━━━━━━━━"
const rupiah = (n) => "Rp" + Math.round(n).toLocaleString("id-ID")

// ---------- baca QR dari gambar ----------

/** beberapa percobaan dengan ukuran/kontras berbeda, karena foto QR sering miring, kecil, atau pucat */
const ATTEMPTS = [
    (img) => img.resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true }),
    (img) => img.resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true }).greyscale().normalise(),
    (img) => img.resize({ width: 600, height: 600, fit: "inside" }).greyscale().normalise(),
    (img) => img.resize({ width: 1600, height: 1600, fit: "inside" }).greyscale().sharpen()
]

async function decodeQr(buffer) {
    const { default: jsQR } = await import("jsqr").catch(() => ({}))
    if (!jsQR) throw new Error("Library jsqr belum terpasang. Jalankan: npm i jsqr")

    for (const prep of ATTEMPTS) {
        const { data, info } = await prep(sharp(buffer).rotate())
            .toColourspace("srgb")
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
        if (info.channels !== 4) continue

        const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
        const result = jsQR(pixels, info.width, info.height)
        if (result?.data) return result.data
    }
    return null
}

// ---------- QRIS (EMV QR) ----------

/** pecah string TLV (2 digit tag, 2 digit panjang, nilai). null kalau formatnya rusak */
function parseTlv(str) {
    const out = []
    let i = 0
    while (i + 4 <= str.length) {
        const tag = str.slice(i, i + 2)
        const len = parseInt(str.slice(i + 2, i + 4), 10)
        if (!Number.isFinite(len) || i + 4 + len > str.length) return null
        out.push([tag, str.slice(i + 4, i + 4 + len)])
        i += 4 + len
    }
    return i === str.length ? out : null
}

/** CRC16/CCITT-FALSE, dipakai di tag 63 QRIS */
function crc16(str) {
    let crc = 0xFFFF
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8
        for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF
    }
    return crc.toString(16).toUpperCase().padStart(4, "0")
}

/** uraikan QRIS jadi data. null kalau bukan QRIS */
function parseQris(content) {
    if (!content.startsWith("000201")) return null
    const tlv = parseTlv(content)
    if (!tlv) return null
    const get = (tag) => tlv.find(([t]) => t === tag)?.[1]

    // tag 26-51 = info merchant per penyedia; yang domain-nya mengandung QRIS membawa NMID di sub-tag 02
    let provider = null
    let nmid = null
    for (const [tag, value] of tlv) {
        const n = Number(tag)
        if (n < 26 || n > 51) continue
        const sub = parseTlv(value)
        if (!sub) continue
        const domain = sub.find(([t]) => t === "00")?.[1] ?? ""
        if (/QRIS/i.test(domain)) nmid = sub.find(([t]) => t === "02")?.[1] ?? nmid
        else if (!provider && domain) provider = domain
    }

    const initiation = get("01")
    const amount = Number(get("54"))
    return {
        type: initiation === "11" ? "Statis" : initiation === "12" ? "Dinamis" : initiation ?? "?",
        name: get("59") ?? null,
        city: get("60") ?? null,
        nmid,
        provider,
        amount: amount > 0 ? amount : null,
        crcOk: content.slice(-8, -4) === "6304" && content.slice(-4).toUpperCase() === crc16(content.slice(0, -4))
    }
}

/** isi kartu Profile Bisnis (tanpa judul, judulnya dipasang sebagai header) */
function profileLines(info) {
    const rows = [
        ["Nama", info.name],
        ["Kota", info.city],
        ["NMID", info.nmid],
        ["Penyedia", info.provider],
        ["Tipe QR", info.type],
        ["Nominal", info.amount ? rupiah(info.amount) : null],
        ["CRC", info.crcOk ? "valid" : "TIDAK valid (QR rusak atau terbaca salah)"]
    ].filter(([, v]) => v)
    const w = Math.max(...rows.map(([k]) => k.length))
    return rows.map(([k, v]) => `${k.padEnd(w)} : ${v}`).join("\n")
}

/** kirim kartu interaktif dengan tombol salin; true kalau terkirim */
async function sendCard(ctx, { title, body, footer, buttonLabel, copyText }) {
    const { sock, m } = ctx
    try {
        await new Interactive(sock)
            .setHeader(title)
            .setBody(body)
            .setFooter(footer)
            .addButtonCopy(buttonLabel, copyText)
            .send(m.chat?.jid ?? ctx.jid ?? m.key.remoteJid, { quoted: m })
        return true
    } catch (e) {
        console.error("[readqr] gagal kirim kartu:", e)
        return false
    }
}

// ---------- plugin ----------

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { q, m, prefix, command } = ctx

    const source = q?.content === "imageMessage"
        ? q
        : m?.content === "imageMessage"
            ? m
            : null

    if (!source) {
        return await m.arashirep(`Kirim foto QR dengan caption *${prefix ?? ""}${command}*, atau reply foto QR dengan perintah itu.`)
    }

    let content
    try {
        const buffer = await source.download("buffer")
        content = await decodeQr(buffer)
    } catch (e) {
        console.error("[readqr] gagal:", e)
        return await m.arashirep(`Gagal membaca gambar.\n${e.message}`)
    }

    if (!content) {
        return await m.arashirep("QR gak kebaca. Pastikan QR-nya jelas, lurus, dan memenuhi gambar (crop dulu kalau ada banyak latar).")
    }

    const info = parseQris(content)

    if (info) {
        const body = profileLines(info)
        const sent = await sendCard(ctx, {
            title: "Profile Bisnis",
            body,
            footer: "Tekan tombol di bawah untuk menyalin QR",
            buttonLabel: info.type === "Statis" ? "Salin QR Statis" : "Salin QRIS",
            copyText: content
        })
        if (sent) return
        // fallback kalau kartu interaktif gagal terkirim: teks biasa, isi mentah di pesan terpisah
        await m.arashirep(`*PROFILE BISNIS*\n${DIV}\n${body}`)
        return await m.arashirep(content)
    }

    // bukan QRIS: kartu "Isi QR" kalau muat (batas body WhatsApp 1024 karakter), kalau tidak teks biasa
    if (content.length <= 900) {
        const sent = await sendCard(ctx, {
            title: "Isi QR",
            body: content,
            footer: "Tekan tombol di bawah untuk menyalin",
            buttonLabel: "Salin isi QR",
            copyText: content
        })
        if (sent) return
    }
    return await m.arashirep(content)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "Read QR",
    commands: ["readqr", "bacaqr", "scanqr"],
    categories: ["tools"],
    description: "Baca QR dari foto (kirim foto + caption atau reply foto). QRIS ikut diuraikan."
}

plugin.meta = {
    filename: "readqr.js",
    version: "1",
    author: config.devName || "Kado",
    note: "Satu file, butuh jsqr",
    path: "tools"
}

export default plugin