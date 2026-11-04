/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { messageStore } from "#store/make-in-memory-store.js"
import { contactStore } from "#store/contact-store.js"
import { getContentType, downloadMediaMessage } from "baileys"
import { config } from "#root/config.js"

const LINE = "━━━━━━━━━━━━━━━━"

function formatDate(ts) {
    if (!ts) return "-"
    const ms = ts > 1e11 ? ts : ts * 1000
    return new Date(ms).toLocaleString("id-ID", {
        timeZone: config.TIME_ZONE || "Asia/Jakarta",
        dateStyle: "medium",
        timeStyle: "medium"
    })
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, q, jid, text } = ctx

    const args = (text || "").trim().split(/\s+/)
    const sub = args[0]?.toLowerCase()

    // Jika ketik .restore list
    if (sub === "list" || sub === "daftar") {
        const list = messageStore.getDeletedMessages(jid, 10)
        if (!list.length) {
            return await m.arashirep("Belum ada riwayat pesan terhapus yang tercatat di chat ini.")
        }
        const textList = list.map((item, idx) => {
            const sJid = item.key?.participant || item.participant || item.key?.remoteJid || ""
            const contact = (contactStore?.resolve ? contactStore.resolve(sJid) : null) || contactStore?.getByPn?.(sJid)
            const sName = contact?.name || item.pushName || sJid.replace(/[^0-9]/g, "") || "Pengguna"
            const ct = getContentType(item.message) || "pesan"
            const snippet = item.message?.conversation || item.message?.[ct]?.text || item.message?.[ct]?.caption || `[Media ${ct}]`
            const time = item.deletedAt ? formatDate(item.deletedAt) : "-"
            return `*${idx + 1}.* *${sName}* — _${ct}_\n   💬 "${snippet.slice(0, 40)}${snippet.length > 40 ? "..." : ""}"\n   🗑️ ${time}`
        }).join("\n\n")

        return await m.arashirep(
            `🗑️ *RIWAYAT PESAN TERHAPUS TERAKHIR*\n${LINE}\n` +
            `${textList}\n${LINE}\n` +
            `💡 Ketik *.restore <nomor>* untuk memulihkan pesan tertentu, contoh: *.restore 2*`
        )
    }

    let targetWAM = null

    // 1. Cek apakah user input nomor indeks (misal: .restore 2)
    const indexNum = parseInt(sub, 10)
    if (Number.isInteger(indexNum) && indexNum > 0) {
        const deletedList = messageStore.getDeletedMessages(jid, 20)
        targetWAM = deletedList[indexNum - 1]
    }

    // 2. Cek apakah me-reply pesan
    if (!targetWAM && q) {
        const targetId = q.id || q.key?.id
        if (targetId) {
            targetWAM = messageStore.getMessageSync(jid, targetId)
        }
    }

    // 3. Fallback ke pesan terakhir yang dihapus di chat ini
    if (!targetWAM) {
        targetWAM = messageStore.getLastDeletedMessage(jid)
    }

    if (!targetWAM || !targetWAM.message) {
        return await m.arashirep(
            `⚠️ Tidak ada pesan terhapus yang tersimpan untuk di-restore di chat ini.\n\n` +
            `💡 *Tips:* Langsung ketik *.restore* begitu ada pesan yang ditarik, atau ketik *.restore list* untuk melihat daftar riwayat!`
        )
    }

    const senderJid = targetWAM.key?.participant || targetWAM.participant || targetWAM.key?.remoteJid || ""
    const contact = (contactStore?.resolve ? contactStore.resolve(senderJid) : null) || contactStore?.getByPn?.(senderJid) || contactStore?.getByLid?.(senderJid)
    const senderName = contact?.name || targetWAM.pushName || senderJid.replace(/[^0-9]/g, "") || "Pengguna"

    const timeSent = formatDate(targetWAM.messageTimestamp?.low || targetWAM.messageTimestamp)
    const timeDeleted = targetWAM.deletedAt ? formatDate(targetWAM.deletedAt) : "Baru saja"

    let actualMsg = targetWAM.message
    let isViewOnce = false

    // Ekstrak jika View Once
    if (
        actualMsg.viewOnceMessage ||
        actualMsg.viewOnceMessageV2 ||
        actualMsg.viewOnceMessageV2Extension
    ) {
        isViewOnce = true
        actualMsg =
            actualMsg.viewOnceMessage?.message ||
            actualMsg.viewOnceMessageV2?.message ||
            actualMsg.viewOnceMessageV2Extension?.message ||
            actualMsg
    }

    const ct = getContentType(actualMsg)
    const rawContent = actualMsg[ct]

    if (rawContent?.viewOnce) {
        isViewOnce = true
        delete rawContent.viewOnce
    }

    const header =
        `♻️ *PESAN BERHASIL DI-RESTORE*\n${LINE}\n` +
        `👤 *Pengirim :* ${senderName}\n` +
        `⏰ *Terkirim :* ${timeSent}\n` +
        `🗑️ *Dihapus  :* ${timeDeleted}\n` +
        (isViewOnce ? `👁️ *Tipe     :* Pesan Sekali Lihat (View Once)\n` : "") +
        `${LINE}`

    const textBody =
        actualMsg.conversation ||
        rawContent?.text ||
        rawContent?.caption ||
        rawContent?.body?.text ||
        ""

    const wamWrapper = {
        ...targetWAM,
        message: actualMsg
    }

    // A. PESAN TEKS
    if (ct === "conversation" || ct === "extendedTextMessage") {
        return await sock.sendMessage(jid, {
            text: `${header}\n💬 *Isi Pesan:*\n${textBody || "(Pesan kosong)"}`
        }, { quoted: m })
    }

    // B. GAMBAR (IMAGE)
    if (ct === "imageMessage") {
        try {
            const buffer = await downloadMediaMessage(wamWrapper, "buffer", {})
            return await sock.sendMessage(jid, {
                image: buffer,
                caption: `${header}\n${textBody ? `\n💬 *Caption:*\n${textBody}` : ""}`.trim()
            }, { quoted: m })
        } catch (e) {
            console.error("[restore] download image error:", e)
        }
    }

    // C. VIDEO
    if (ct === "videoMessage") {
        try {
            const buffer = await downloadMediaMessage(wamWrapper, "buffer", {})
            return await sock.sendMessage(jid, {
                video: buffer,
                caption: `${header}\n${textBody ? `\n💬 *Caption:*\n${textBody}` : ""}`.trim()
            }, { quoted: m })
        } catch (e) {
            console.error("[restore] download video error:", e)
        }
    }

    // D. STIKER
    if (ct === "stickerMessage") {
        try {
            const buffer = await downloadMediaMessage(wamWrapper, "buffer", {})
            await sock.sendMessage(jid, { text: header }, { quoted: m })
            return await sock.sendMessage(jid, { sticker: buffer }, { quoted: m })
        } catch (e) {
            console.error("[restore] download sticker error:", e)
        }
    }

    // E. AUDIO / VOICE NOTE
    if (ct === "audioMessage") {
        try {
            const buffer = await downloadMediaMessage(wamWrapper, "buffer", {})
            await sock.sendMessage(jid, { text: header }, { quoted: m })
            return await sock.sendMessage(jid, {
                audio: buffer,
                mimetype: rawContent?.mimetype || "audio/mp4",
                ptt: Boolean(rawContent?.ptt)
            }, { quoted: m })
        } catch (e) {
            console.error("[restore] download audio error:", e)
        }
    }

    // F. DOKUMEN
    if (ct === "documentMessage") {
        try {
            const buffer = await downloadMediaMessage(wamWrapper, "buffer", {})
            return await sock.sendMessage(jid, {
                document: buffer,
                fileName: rawContent?.fileName || "document",
                mimetype: rawContent?.mimetype || "application/octet-stream",
                caption: `${header}\n${textBody ? `\n💬 *Keterangan:*\n${textBody}` : ""}`.trim()
            }, { quoted: m })
        } catch (e) {
            console.error("[restore] download document error:", e)
        }
    }

    // G. FALLBACK RELAY
    try {
        await sock.sendMessage(jid, { text: header }, { quoted: m })
        await sock.relayMessage(jid, actualMsg, {})
    } catch {
        if (textBody) {
            await sock.sendMessage(jid, {
                text: `${header}\n💬 *Teks Terlampir:*\n${textBody}`
            }, { quoted: m })
        } else {
            await m.arashirep(`${header}\n⚠️ Media gagal direlay ulang, tetapi tercatat dikirim oleh *${senderName}*.`)
        }
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "restore deleted message",
    commands: ["restore", "res", "antidelete", "undelete", "deleted"],
    categories: ["tools"],
    description: "Restore / pulihkan pesan, gambar, video, VN, stiker, dan dokumen yang ditarik atau dihapus oleh pengirim"
}

plugin.meta = {
    filename: "restore.js",
    version: "1.1.0",
    author: "Kado",
    note: "Restore pesan dan media terhapus dari makeInMemoryStore SQLite database permanen",
    path: "tools"
}

export default plugin
