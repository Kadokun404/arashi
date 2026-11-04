/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import QRCode from "qrcode"
import { config } from "#root/config.js"
import {
    MIN_AMOUNT, MAX_AMOUNT, POLL_INTERVAL_MS, EXPIRE_MS, DIV,
    sleep, rupiah, nowLocal, isConfigured, parseItems, pickTotal, releaseTotal,
    apiPost, apiGet, buildStruk, gopayCancel, deleteCard, sendPaymentCard
} from "#helper/qris-payment.js"

/**
 * @typedef {object} ActivePayment
 * @property {boolean} cancelled
 * @property {{remoteJid: string, id: string, fromMe: boolean} | null} cardKey
 * @property {number} amount total yang harus dibayar (nominal + kode unik)
 * @property {number} base nominal sebelum kode unik
 * @property {string} refShort
 * @property {string} jid chat tempat pembayaran dibuat
 * @property {string} sender yang bikin pembayaran
 */

/** @type {Map<string, ActivePayment>} refNo -> sesi pembayaran yang lagi nunggu */
const activePayments = new Map()

const usageText = (p) =>
    `*Cara pakai:*\n` +
    `• ${p}pay <nominal>  _(contoh: ${p}pay 5000, ditambah kode unik otomatis)_\n` +
    `• ${p}pay <qty> <barang> <harga>, ... --print  _(kirim struk gambar)_\n` +
    `• ...--print-c  _(struk gambar + caption)_\n` +
    `• ...--doc  _(struk dikirim sebagai file, bukan foto)_\n` +
    `• ${p}pay cancel <refId|nominal>`

/**
 * cari sesi yang mau dibatalin
 * - token kosong (tombol Batal): sesi terakhir milik pengirim di chat ini
 * - token = refNo / Ref ID pendek / nominal
 */
function findPayment(jid, sender, token) {
    const list = [...activePayments.entries()].filter(([, e]) => e.jid === jid && !e.cancelled)
    if (!token) return list.reverse().find(([, e]) => e.sender === sender)

    const byRef = list.find(([ref, e]) => ref === token || e.refShort === token.toUpperCase())
    if (byRef) return byRef

    if (/^[\d.,]+$/.test(token)) {
        const amt = parseInt(token.replace(/[^\d]/g, ""), 10)
        // cocok ke total (nominal + kode unik) dulu, baru ke nominal asli
        return list.find(([, e]) => e.amount === amt) ?? list.find(([, e]) => e.base === amt)
    }
}

/**
 * @param {PluginCtx} ctx
 * @param {string} sender
 * @param {string} token
 */
async function cancelPayment(ctx, sender, token) {
    const { sock, m, jid, isOwner } = ctx
    const found = findPayment(jid, sender, token)

    if (!found) {
        // sesi gak ada di memori (misal bot habis restart), owner masih boleh batalin lewat nominal
        if (isOwner && /^[\d.,]+$/.test(token)) {
            const amount = parseInt(token.replace(/[^\d]/g, ""), 10)
            await gopayCancel({ amount })
            return await m.arashirep(`*PEMBAYARAN DIBATALKAN*\n${DIV}\nNominal : *${rupiah(amount)}*\n${DIV}\nQRIS sudah dibatalkan.`)
        }
        return await m.arashirep("Gak ada pembayaran aktif yang bisa dibatalkan.")
    }

    const [refNo, entry] = found
    if (entry.sender !== sender && !isOwner) {
        return await m.arashirep("Cuma yang bikin pembayaran atau owner yang bisa membatalkan.")
    }

    entry.cancelled = true
    await deleteCard(sock, jid, entry.cardKey)
    await gopayCancel({ ref: refNo })
    return await m.arashirep(`*PEMBAYARAN DIBATALKAN*\n${DIV}\nTotal   : *${rupiah(entry.amount)}*\nRef ID  : ${entry.refShort}\n${DIV}\nQRIS sudah dibatalkan.`)
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, q, jid, text, command, prefix } = ctx
    const sender = m.sender ?? m.key.participant ?? m.key.remoteJid
    const raw = String(text ?? "").trim()
    const p = prefix ?? ""

    // 1. batal: tombol "Batal" (command paycancel) atau teks "pay cancel <ref|nominal>"
    if (command === "paycancel" || /^cancel\b/i.test(raw)) {
        const token = raw.replace(/^cancel\b/i, "").trim()
        return await cancelPayment(ctx, sender, token)
    }

    // 2. baca opsi
    const wantCap = /--print-c\b/i.test(raw)
    const wantPrint = wantCap || /--print\b/i.test(raw)
    const wantDoc = /--doc\b/i.test(raw)
    const body = raw.replace(/--print-c/ig, "").replace(/--print/ig, "").replace(/--doc/ig, "").trim()

    let items = null
    let amount
    if (wantPrint) {
        items = parseItems(body)
        if (!items) return await m.arashirep(usageText(p))
        amount = items.reduce((t, i) => t + i.qty * i.harga, 0)
    } else {
        amount = parseInt(body.replace(/[^\d]/g, ""), 10)
    }

    if (!amount || amount < MIN_AMOUNT) return await m.arashirep(usageText(p))
    if (amount > MAX_AMOUNT) return await m.arashirep(`Nominal maksimal ${rupiah(MAX_AMOUNT)}.`)
    if (!isConfigured()) return await m.arashirep("QRIS_API_BASE / QRIS_API_TOKEN belum diisi di config.js")

    // 3. total = nominal + kode unik, lalu bikin QRIS di server
    const picked = pickTotal(amount)
    if (!picked) return await m.arashirep("Lagi banyak pembayaran dengan nominal ini, coba lagi sebentar.")
    const { total, code } = picked

    let refNo, qrContent, amt
    try {
        const created = await apiPost("/api/gopay/create", { amount: total })
        refNo = created.ref_no
        qrContent = created.qr_content
        amt = Number(created.amount) || total
        if (!refNo || !qrContent) throw new Error("respon create tidak valid")
    } catch (e) {
        releaseTotal(total)
        console.error("[qris] gagal create:", e)
        return await m.arashirep("Gagal membuat QRIS, coba lagi sebentar.")
    }

    const refShort = String(refNo).replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase()
    activePayments.set(refNo, { cancelled: false, cardKey: null, amount: amt, base: amount, refShort, jid, sender })
    const uniqueLine = code > 0 ? [`Kode unik : ${rupiah(code)}`] : []

    const createdAt = new Date()
    const qrBuffer = await QRCode.toBuffer(qrContent, { width: 512, margin: 2, errorCorrectionLevel: "M" })

    // 4. kirim kartu pembayaran
    const bodyLines = items
        ? [
            "*GoPay QRIS Payment*",
            "",
            ...items.map((i) => `• ${i.qty}× ${i.nama} — ${rupiah(i.qty * i.harga)}`),
            "",
            ...(code > 0 ? [`Subtotal  : ${rupiah(amount)}`] : []),
            ...uniqueLine,
            `Total     : *${rupiah(amt)}*`,
            `Ref ID    : ${refShort}`,
            "",
            `Bayar PERSIS ${rupiah(amt)}. Scan pakai GoPay atau aplikasi QRIS lain, struk dikirim otomatis setelah bayar.`
        ]
        : [
            "*GoPay QRIS Payment*",
            "",
            ...(code > 0 ? [`Nominal    : ${rupiah(amount)}`] : []),
            ...uniqueLine,
            `Total bayar: *${rupiah(amt)}*`,
            `Ref ID     : ${refShort}`,
            "",
            `Bayar PERSIS ${rupiah(amt)}: buka GoPay, DANA, OVO, ShopeePay atau m-banking → menu Scan/QRIS → arahkan ke kode di atas. Status diperbarui otomatis.`
        ]
    const footer = "Berlaku 5 menit. Pembayaran terdeteksi otomatis."

    let cardKey = null
    try {
        cardKey = await sendPaymentCard(sock, m, jid, qrBuffer, bodyLines.join("\n"), footer)
    } catch (e) {
        activePayments.delete(refNo)
        releaseTotal(amt)
        await gopayCancel({ ref: refNo })
        return await m.arashirep(`Gagal mengirim kartu QRIS.\n${e.message}`)
    }
    const entry = activePayments.get(refNo)
    if (entry) entry.cardKey = cardKey

    // 5. polling status sampai dibayar / kadaluarsa / dibatalkan
    const deadline = Date.now() + EXPIRE_MS
    let paid = false
    while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS)
        if (activePayments.get(refNo)?.cancelled) {
            activePayments.delete(refNo)
            return
        }
        try {
            const status = await apiGet("/api/gopay/status", {
                ref: refNo,
                amount: amt,
                created_at: createdAt.toISOString()
            })
            if (status?.paid === true) {
                paid = true
                break
            }
        } catch { }
    }

    activePayments.delete(refNo)
    await deleteCard(sock, jid, cardKey)

    // 6. hasil
    if (!paid) {
        await gopayCancel({ ref: refNo })
        return await m.arashirep(`*PEMBAYARAN KEDALUWARSA*\n${DIV}\nTotal   : *${rupiah(amt)}*\nRef ID  : ${refShort}\n${DIV}\nTidak ada pembayaran masuk dalam 5 menit.\nKirim perintahnya lagi untuk mengulang.`)
    }

    const caption = `*PEMBAYARAN BERHASIL*\n${DIV}\nTotal   : *${rupiah(amt)}*${code > 0 ? `\n(nominal ${rupiah(amount)} + kode unik ${rupiah(code)})` : ""}\nRef ID  : ${refShort}\nDibayar : ${nowLocal()}\n${DIV}\nTerima kasih, pembayaran sudah dikonfirmasi!`

    if (wantPrint && items) {
        const kasir = m.pushName ?? null
        const qPn = q?.contact?.pn ?? null
        const pelanggan = q?.contact?.name || q?.pushName || (qPn ? "+" + qPn.split("@")[0].split(":")[0] : null)

        const strukBuffer = await buildStruk({ items, paidAmt: amt, uniqueCode: code, refNo: refShort, kasir, pelanggan })
        if (strukBuffer) {
            try {
                const media = wantDoc
                    ? { document: strukBuffer, mimetype: "image/png", fileName: `Struk-${refShort}.png` }
                    : { image: strukBuffer, mimetype: "image/png" }
                await sock.sendMessage(jid, { ...media, caption: wantCap ? caption : undefined }, { quoted: m })
                return
            } catch (e) {
                console.error("[qris] gagal kirim struk:", e)
            }
        }
    }
    return await m.arashirep(caption)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "GoPay QRIS Payment",
    commands: ["pay", "paycancel"],
    categories: ["tools"],
    description: "Buat QRIS GoPay dan tunggu pembayaran masuk. pay <nominal> | pay <qty> <barang> <harga>, ... --print | pay cancel <ref|nominal>"
}

plugin.meta = {
    filename: "qris.js",
    version: "4",
    author: config.devName || "Kado",
    note: "API QRIS eksternal, konfigurasi di config.js, nominal ditambah kode unik",
    path: "tools"
}

export default plugin
