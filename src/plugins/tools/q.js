/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { getContentType, normalizeMessageContent, downloadMediaMessage } from "baileys"

const MEDIA_FIELD_MAP = {
    imageMessage: "image",
    videoMessage: "video",
    audioMessage: "audio",
    stickerMessage: "sticker",
    documentMessage: "document",
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q } = ctx

    if (!q) return await m.arashirep('reply pesan yang mau diambil "pesan yang di-reply"-nya kak')

    // pake full raw message kalau ada (dari cache makeInMemoryStore), biar
    // contextInfo/quotedMessage nya paling akurat
    const qMessage = q.fullMessage?.message || q.message
    const qContentType = getContentType(qMessage)
    const contextInfo = qMessage?.[qContentType]?.contextInfo
    const nestedQuoted = contextInfo?.quotedMessage

    if (!nestedQuoted) {
        return await m.arashirep('pesan yang kamu reply ini bukan balesan ke pesan lain kak, gaada yang bisa diambil')
    }

    const normalizedNested = normalizeMessageContent(nestedQuoted)
    const nestedContentType = getContentType(normalizedNested)
    const nativeField = MEDIA_FIELD_MAP[nestedContentType]

    try {
        // teks biasa (conversation polos, atau extendedTextMessage)
        if (nestedContentType === "conversation" || nestedContentType === "extendedTextMessage") {
            const text = normalizedNested.conversation || normalizedNested.extendedTextMessage?.text
            if (!text) return await m.arashirep('❌ isi pesan nya kosong/gak ke baca')
            return await sock.sendMessage(jid, { text }, { quoted: m.raw })
        }

        // media (image/video/audio/sticker/document) -> download & kirim sesuai type
        if (nativeField) {
            const fakeMessage = {
                key: q.key,
                message: normalizedNested
            }

            const buffer = await downloadMediaMessage(fakeMessage, "buffer")
            const mediaContent = normalizedNested[nestedContentType]

            const sendOptions = { [nativeField]: buffer }
            if (mediaContent?.mimetype) sendOptions.mimetype = mediaContent.mimetype
            if (mediaContent?.caption) sendOptions.caption = mediaContent.caption
            if (nativeField === "audio") sendOptions.ptt = !!mediaContent?.ptt
            if (nativeField === "video") sendOptions.gifPlayback = !!mediaContent?.gifPlayback
            if (nativeField === "document") sendOptions.fileName = mediaContent?.fileName || `file-${Date.now()}`

            return await sock.sendMessage(jid, sendOptions, { quoted: m.raw })
        }

        // tipe lain (contact/location/poll/dst) -> fallback relay apa adanya
        return await sock.relayMessage(jid, normalizedNested, { messageId: "QQ" + Date.now() })
    } catch (e) {
        console.error('gagal ambil pesan yang di-reply', e)
        return await m.arashirep(`❌ gagal ambil pesan nya: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "get quoted of quoted",
    commands: ["q"],
    categories: ["tools"],
    description: "y"
}

plugin.meta = {
    filename: "q.js",
    version: "1",
    author: "Kado",
    note: "besok aja",
    path: "tools"
}

export default plugin