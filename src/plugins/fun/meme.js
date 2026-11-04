/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import { config } from "#root/config.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid } = ctx

    try {
        const res = await fetch('https://api.azbry.com/api/random/meme')
        const buffer = Buffer.from(await res.arrayBuffer())

        const sticker = new Sticker(buffer, {
            pack: config.botName,
            author: config.devName,
            type: StickerTypes.FULL,
            quality: 70
        })

        await sock.sendMessage(jid, { sticker: await sticker.toBuffer() }, { quoted: m.raw })
    } catch (e) {
        await m.arashirep('❌ api error')
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "meme sticker",
    commands: ["meme"],
    categories: ["fun"],
    description: "kirim meme random sebagai stiker"
}

plugin.meta = {
    filename: "meme.js",
    version: "1",
    author: "Kado",
    note: "gabut",
    path: "fun"
}

export default plugin