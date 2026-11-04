/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { generateWAMessageFromContent, prepareWAMessageMedia } from 'baileys'
import { config } from "#root/config.js"
import { googleSearchImage } from "#root/src/scrape/google-image.js"

const DEFAULT_COUNT = 5
const MAX_COUNT = 20

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text, prefix, command } = ctx

    if (!text) {
        return await m.arashirep(
            `masukkan kata kunci pencarian nya kak\n\n` +
            `contoh:\n` +
            `*${prefix ? prefix + ' ' : ''}${command} furina fanart*\n` +
            `*${prefix ? prefix + ' ' : ''}${command} furina fanart -n 10* (jumlah gambar, max ${MAX_COUNT})\n` +
            `*${prefix ? prefix + ' ' : ''}${command} furina fanart -u* (mode url list aja)`
        )
    }

    const isUrlMode = /-u\b/.test(text)
    const countMatch = text.match(/-n\s*(\d+)/)
    const count = countMatch ? Math.min(parseInt(countMatch[1], 10) || DEFAULT_COUNT, MAX_COUNT) : DEFAULT_COUNT

    const query = text
        .replace(/-u\b/, '')
        .replace(/-n\s*\d+/, '')
        .trim()

    if (!query) return await m.arashirep('masukkan kata kunci pencarian nya kak')

    await m.arashirep(`🔎 nyari gambar "${query}"...`)

    let result
    try {
        result = await googleSearchImage(query)
    } catch (e) {
        return await m.arashirep(`❌ ${e.message}`)
    }

    const images = result.images.slice(0, count)

    if (isUrlMode) {
        const print = images
            .map((img, i) => `${i + 1}. ${img.imageUrl}${img.width && img.height ? ` (${img.width}x${img.height})` : ''}`)
            .join('\n')
        return await m.arashirep(`🖼️ *hasil pencarian "${query}"* (${images.length}/${result.total})\n\n${print}`)
    }

    // mode kirim album, sama polanya kayak pin.js (relayMessage per media,
    // di-associate ke albumMessage biar tampil sebagai satu galeri di wa)
    const medias = await Promise.all(
        images.map(img =>
            prepareWAMessageMedia({ image: { url: img.imageUrl } }, { upload: sock.waUploadToServer })
        )
    )

    const albumMessage = generateWAMessageFromContent(jid, {
        messageContextInfo: {
            messageSecret: Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)))
        },
        albumMessage: {
            expectedImageCount: medias.length,
            expectedVideoCount: 0
        }
    }, { quoted: m.raw })

    await sock.relayMessage(jid, albumMessage.message, { messageId: albumMessage.key.id })

    for (const media of medias) {
        const imgMsg = generateWAMessageFromContent(jid, {
            imageMessage: media.imageMessage
        }, {
            quoted: m.raw
        })
        imgMsg.message.messageContextInfo = {
            messageAssociation: {
                associationType: 1,
                parentMessageKey: albumMessage.key
            }
        }
        await sock.relayMessage(jid, imgMsg.message, { messageId: imgMsg.key.id })
        await new Promise(r => setTimeout(r, 1500))
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "google image search",
    commands: ["gimage", "googleimage", "gimg"],
    categories: ["search"],
    description: `cari gambar via google image search, dikirim sebagai album.\n-u = mode list url aja, -n <jumlah> = atur jumlah gambar (max ${MAX_COUNT}, default ${DEFAULT_COUNT})`
}

plugin.meta = {
    filename: "gimage.js",
    version: "1",
    author: config.devName,
    note: "scraper di src/scrape/google-image.js (by wolep), pola kirim album disamain kayak pin.js pake relayMessage + albumMessage",
    path: "search"
}

export default plugin