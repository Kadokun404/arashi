/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { generateWAMessageFromContent, prepareWAMessageMedia } from "baileys"

// Sisipkan metadata (EXIF) ke buffer WEBP mentah, dipakai untuk kasih
// atribut khusus pada sticker (nama pack, publisher, emoji, dsb).
function buildStickerExif(metadata) {
    const json = Buffer.from(JSON.stringify(metadata), 'utf-8')

    const exif = Buffer.concat([
        Buffer.from([
            0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
            0x07, 0x00,
        ]),
        Buffer.alloc(4),
        Buffer.from([0x16, 0x00, 0x00, 0x00]),
        json,
    ])

    exif.writeUInt32LE(json.length, 14)
    return exif
}

function makeChunk(type, data) {
    const typeBuffer = Buffer.from(type)
    const sizeBuffer = Buffer.alloc(4)
    sizeBuffer.writeUInt32LE(data.length, 0)

    const padding = data.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0)

    return Buffer.concat([typeBuffer, sizeBuffer, data, padding])
}

function setWebpExif(webpBuffer, metadata) {
    if (
        webpBuffer.slice(0, 4).toString() !== 'RIFF' ||
        webpBuffer.slice(8, 12).toString() !== 'WEBP'
    ) {
        throw new Error('File bukan WEBP valid.')
    }

    const chunks = []
    let offset = 12

    while (offset + 8 <= webpBuffer.length) {
        const type = webpBuffer.slice(offset, offset + 4).toString()
        const size = webpBuffer.readUInt32LE(offset + 4)
        const chunkStart = offset
        const chunkEnd = offset + 8 + size + (size % 2)

        if (chunkEnd > webpBuffer.length) break

        if (type !== 'EXIF') {
            chunks.push(webpBuffer.slice(chunkStart, chunkEnd))
        }

        offset = chunkEnd
    }

    const exifPayload = buildStickerExif(metadata)
    const exifChunk = makeChunk('EXIF', exifPayload)

    const body = Buffer.concat([...chunks, exifChunk])

    const header = Buffer.alloc(12)
    header.write('RIFF', 0)
    header.writeUInt32LE(body.length + 4, 4)
    header.write('WEBP', 8)

    return Buffer.concat([header, body])
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, themeManager } = ctx

    if (!q) return await m.arashirep('reply sticker WEBP biasa dulu kak')

    // di project ini q.content itu getContentType dari isi quotedMessage
    // langsung (udah bukan perlu digali manual lewat contextInfo)
    if (q.content !== 'stickerMessage') return await m.arashirep('reply sticker WEBP biasa dulu kak')

    const stickerMessage = q.message?.stickerMessage

    if (stickerMessage?.mimetype !== 'image/webp') {
        return await m.arashirep('ini bukan sticker WEBP biasa. buat lottie/application/was caranya beda')
    }

    try {
        // q.download udah otomatis handle decrypt+download (gak perlu
        // downloadContentFromMessage manual + loop chunk kayak referensi asli)
        const stickerBuffer = await q.download('buffer')

        const botName = themeManager?.getData()?.title || 'Fauna'

        const metadata = {
            'sticker-pack-id': `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            'sticker-pack-name': botName,
            'sticker-pack-publisher': '',
            'accessibility-text': botName,
            emojis: ['🦊', '✨'],
            'is-from-sticker-maker': 0,
            'is-avatar-sticker': 1,
            'avatar-sticker-template-id': 'whatsapp',
            'is-ai-sticker': 1,
            'is-avatar-country-sticker': 1,
            'is-avatar-instant-sticker': 1,
            'sticker-maker-source-type': 4,
            'is-avatar-social-sticker': 1,
            'avatar-sticker-style': 'whatsapp',
            'avatar-sticker-revision-id': '2026',
            'is-from-user-created-pack': 1,
            'origin-pack-id': 'whatsapp',
            'is-text-sticker': 1,
        }

        const finalStickerBuffer = setWebpExif(stickerBuffer, metadata)

        const media = await prepareWAMessageMedia(
            { sticker: finalStickerBuffer },
            { upload: sock.waUploadToServer }
        )

        const msgContent = {
            messageContextInfo: {
                limitSharingV2: {
                    sharingLimited: true,
                    trigger: 'CHAT_SETTING',
                    limitSharingSettingTimestamp: Date.now().toString(),
                    initiatedByMe: true,
                },
            },
            stickerMessage: {
                ...media.stickerMessage,
                isAnimated: stickerMessage.isAnimated || false,
                isAvatar: true,
                isAiSticker: true,
                isLottie: false,
            },
        }

        // pake generateWAMessageFromContent + relayMessage (bukan sock.sendMessage
        // biasa) karena messageContextInfo.limitSharingV2 & flag avatar-sticker
        // gak bisa disisipin lewat opsi sendMessage biasa
        const msg = generateWAMessageFromContent(jid, msgContent, {
            quoted: m,
            userJid: sock.user.id,
        })

        await sock.relayMessage(jid, msg.message, { messageId: msg.key.id })
    } catch (e) {
        console.error('gagal inject sticker metadata', e)
        return await m.arashirep('❌ gagal proses sticker nya, cek console')
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "sticker anti colong",
    commands: ["stca", "stattr", "anti"],
    categories: ["maker"],
    description: "besok aja"
}

plugin.meta = {
    filename: "sticker-anti-colong.js",
    version: "1",
    author: "Kado",
    note: "besok",
    path: "maker"
}

export default plugin