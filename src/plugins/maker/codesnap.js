import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    const code = q?.text || text

    if (!code) return await m.arashirep('reply atau ketik code yang mau di-snap kak')

    await m.arashirep('membuat codesnap...')

    const res = await fetch(`https://api.nexray.eu.cc/maker/codesnap?code=${encodeURIComponent(code)}`)
    const buffer = Buffer.from(await res.arrayBuffer())

    const data = {
        botName: config.botName,
        author: config.devName,
        length: code.length,
        lines: code.split('\n').length
    }

    await sock.sendMessage(jid, {
        image: buffer,
        caption: `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``
    }, { quoted: m.raw })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "codesnap",
    commands: ["codesnap", "cs"],
    categories: ["maker"],
    description: "buat snapshot code jadi gambar"
}

plugin.meta = {
    filename: "codesnap.js",
    version: "1",
    author: "Kado",
    note: "gabut",
    path: "maker"
}

export default plugin