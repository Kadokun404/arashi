/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import { config } from "#root/config.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    const content = text || q?.text

    if (!content) return await m.arashirep('reply text atau bratcewe text')

    const res = await fetch(`https://api.theresav.biz.id/maker/bratcewe?text=${encodeURIComponent(content)}&apikey=catesyaaa`)
    const buffer = Buffer.from(await res.arrayBuffer())

    const sticker = new Sticker(buffer, {
        pack: config.botName,
        author: config.devName,
        type: StickerTypes.FULL,
        quality: 70
    })

    const stickerBuffer = await sticker.toBuffer()

    await sock.sendMessage(jid, {
        sticker: stickerBuffer
    }, { quoted: m })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "brat cewe",
    commands: ["bratcewe"],
    categories: ["maker"],
    description: "buat sticker brat dari teks"
}

plugin.meta = {
    filename: "bratcewe.js",
    version: "1",
    author: "Kado",
    note: "gabut",
    path: "maker"
}

export default plugin