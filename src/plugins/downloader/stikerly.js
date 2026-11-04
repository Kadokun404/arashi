/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { generateWAMessageFromContent, prepareWAMessageMedia } from 'baileys'
import { config } from "#root/config.js"

const STICKERLY_URL_REGEX = /sticker\.ly\/s\/([A-Za-z0-9]+)/i
const STICKERLY_ID_REGEX = /^[A-Za-z0-9]+$/

const PACK_PUBLISHER = "Z-Hiruira.dev"
const PACK_NAME = `${config.botName} Pack`

/**
 * ambil pack id dari input user, bisa berupa url lengkap atau id doang
 * @param {string} input
 * @returns {string|undefined}
 */
function extractPackId(input) {
    if (!input) return undefined
    const trimmed = input.trim()

    const urlMatch = trimmed.match(STICKERLY_URL_REGEX)
    if (urlMatch) return urlMatch[1]

    if (STICKERLY_ID_REGEX.test(trimmed)) return trimmed

    return undefined
}

/**
 * ekstrak semua url .webp punya sticker.ly dari html, dan filter cuma yang punya packId nya
 * @param {string} html
 * @param {string} packId
 * @returns {string[]}
 */
function extractStickerUrls(html, packId) {
    const matches = html.match(/https:\/\/stickerly\.pstatic\.net\/sticker_pack\/[^\s"')]+\.webp/g) || []
    const uniqueUrls = [...new Set(matches)]
    return uniqueUrls.filter(url => url.includes(`/${packId}/`))
}

/**
 * ambil title pack dari tag <title> html, dipakai buat caption doang
 * @param {string} html
 * @returns {string|undefined}
 */
function extractPackTitle(html) {
    const match = html.match(/<title>(.*?)<\/title>/i)
    return match ? match[1].trim() : undefined
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    const source = text || q?.text || ''
    const packId = extractPackId(source)

    if (!packId) return await m.arashirep(
        `masukkan link atau id sticker pack nya, contoh:\n` +
        `sly https://sticker.ly/s/3CLTUB\n` +
        `atau\n` +
        `sly 3CLTUB`
    )

    await m.arashirep('⏳ mengambil sticker pack...')

    const pageUrl = `https://sticker.ly/s/${packId}`
    const res = await fetch(pageUrl)

    if (!res.ok) return await m.arashirep(`❌ gagal mengambil pack, pastikan id/link nya bener (HTTP ${res.status})`)

    const html = await res.text()
    const stickerUrls = extractStickerUrls(html, packId)
    const originalTitle = extractPackTitle(html)

    if (stickerUrls.length === 0) return await m.arashirep(`❌ gak nemu sticker di pack ini, pastikan id/link nya bener`)

    // download semua sticker webp jadi media yang udah siap di kirim ke whatsapp.
    // catatan: link cdn sticker.ly itu kadang ke cache sebentar doang / gampang expired,
    // jadi kita gak langsung gagal total kalau ada satu/lebih yg 404, kita skip aja
    // yang gagal dan tetep lanjut kirim sisanya yang berhasil
    const stickerResults = await Promise.allSettled(
        stickerUrls.map(url =>
            prepareWAMessageMedia({ sticker: { url } }, { upload: sock.waUploadToServer })
        )
    )

    const stickerMedias = []
    let failedCount = 0
    for (const result of stickerResults) {
        if (result.status === 'fulfilled') {
            stickerMedias.push(result.value)
        } else {
            failedCount++
        }
    }

    if (stickerMedias.length === 0) {
        return await m.arashirep(
            `❌ semua sticker (${stickerUrls.length}) gagal di ambil, kemungkinan link cdn nya udah expired / pack nya udah di hapus dari sticker.ly`
        )
    }

    const stickers = stickerMedias.map((media, i) => ({
        ...media.stickerMessage,
        isAnimated: false,
        isLottie: false,
        emojis: ["✨"],
        accessibilityLabel: "",
        mimetype: "image/webp"
    }))

    const stickerPackMessageContent = {
        stickerPackMessage: {
            stickerPackId: packId,
            name: PACK_NAME,
            publisher: PACK_PUBLISHER,
            stickers,
            packDescription: pageUrl,
            stickerPackSize: String(stickers.length),
            stickerPackOrigin: "USER_CREATED"
        }
    }

    const stickerPackMsg = generateWAMessageFromContent(jid, stickerPackMessageContent, { quoted: m.raw })

    await sock.relayMessage(jid, stickerPackMsg.message, { messageId: stickerPackMsg.key.id })

    await m.arashirep(
        `✅ berhasil mengirim sticker pack\n\n` +
        `judul asli: ${originalTitle || '(gak ketemu)'}\n` +
        `total sticker: ${stickers.length}\n` +
        `pack id: ${packId}`
    )
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "sticker.ly downloader",
    commands: ["sly"],
    categories: ["downloader"],
    description: "download sticker pack dari sticker.ly pakai link atau id pack, hasilnya di kirim sebagai whatsapp sticker pack"
}

plugin.meta = {
    filename: "stikerly.js",
    version: "1",
    author: config.devName,
    note: "publisher & nama pack di custom, sticker mentah nya tetep dari sticker.ly",
    path: "downloader"
}

export default plugin