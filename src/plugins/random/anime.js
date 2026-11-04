/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

const TYPES = [
    "neko", "shinobu", "megumin",
    "bully", "cuddle", "cry", "hug", "awoo", "kiss",
    "pat", "smug", "bonk", "yeet", "blush", "smile", "wave",
    "highfive", "handhold", "nom", "bite",
    "glomp", "slap", "kill", "happy", "wink", "poke", "dance", "cringe"
]

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, command } = ctx

    const type = command

    try {
        const res = await fetch(`https://api.nexray.eu.cc/random/anime?type=${type}`)
        const contentType = res.headers.get("content-type") || ""
        const buffer = Buffer.from(await res.arrayBuffer())

        if (contentType.includes("gif")) {
            return await sock.sendMessage(jid, {
                video: buffer,
                gifPlayback: true,
                caption: type
            }, { quoted: m.raw })
        }

        return await sock.sendMessage(jid, {
            image: buffer,
            caption: type
        }, { quoted: m.raw })
    } catch (e) {
        return await m.arashirep(`failed to fetch ${type}: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "random anime",
    commands: TYPES,
    categories: ["random"],
    description: "random anime reaction image/gif (waifu, hug, pat, slap, cringe, etc)"
}

plugin.meta = {
    filename: "anime.js",
    version: "1",
    author: "Kado",
    note: "1 plugin nampung semua type, command nya langsung jadi type query nya",
    path: "random"
}

export default plugin