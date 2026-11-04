/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid } = ctx

    try {
        await sock.sendMessage(jid, {
            image: { url: "https://api.nexray.eu.cc/random/ba" },
            caption: ""
        }, { quoted: m.raw })
    } catch (e) {
        await m.arashirep(`Failed to fetch image: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "blue archive",
    commands: ["ba", "bluearchive"],
    categories: ["random"],
    description: "random blue archive image"
}

plugin.meta = {
    filename: "ba.js",
    version: "1",
    author: "Kado",
    note: "jangan sange plc",
    path: "random"
}

export default plugin