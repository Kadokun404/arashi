/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { config } from "#root/config.js"
import { createSticker } from "#root/src/helper/sticker-converter.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    const content = text || q?.text

    if (!content) return await m.arashirep('reply text atau bratvid text')

    try {
        // Fetch the video buffer from the API
        const res = await fetch(`https://api.theresav.biz.id/maker/bratvid?text=${encodeURIComponent(content)}&format=mp4`)
        const buffer = Buffer.from(await res.arrayBuffer())

        // Convert MP4 to Animated Sticker via FFmpeg direct
        const stickerBuffer = await createSticker(buffer, {
            isVideo: true,
            isFull: true,
            pack: config.botName,
            author: config.devName
        })

        await sock.sendMessage(jid, {
            sticker: stickerBuffer
        }, { quoted: m })
    } catch (e) {
        return await m.arashirep(`❌ Gagal membuat bratvid: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "brat video",
    commands: ["bratvid"],
    categories: ["maker"],
    description: "buat sticker video brat dari teks"
}

plugin.meta = {
    filename: "bratvid.js",
    version: "2",
    author: "Kado x Arashi",
    note: "menggunakan sticker-converter anti corrupt",
    path: "maker"
}

export default plugin
