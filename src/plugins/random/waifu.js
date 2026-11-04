/** @import {PluginCtx, Plugin} from "../../types/types.js" */

/**
 * @param {PluginCtx} ctx 
 * @returns {Promise <any>}
 */
async function run(ctx) {
    const { m, q, sock, jid } = ctx

    // api hit, cuma ambil gambar yang size nya <= 2 megabyte
    const response = await fetch('https://api.waifu.im/images?ByteSize=<=2097152')
    if (!response.ok) throw Error(`${response.status} ${response.statusText}`)

    // pick up value and early return
    const json = await response.json()
    const url = json.items[0]?.url
    if (!url) throw Error (`url nya kosong`)
    const source = json.items[0]?.source || 'unknown'

    // send to chat
    return await sock.sendMessage(jid, {
        image: { url },
        caption: `source: ${source}`
    }, {
        quoted: q || m
    })


}

/** @type {Plugin} */
const plugin = { run }

plugin.name = "random waifu"
plugin.commands = [ "waifu"]
plugin.categories = ["random"]
plugin.description = "get random waifu. thanks to https://docs.waifu.im/"

plugin.meta = {
    filename: "waifu.js",
    version: "1",
    author: "kado",
    note: "gabut",
    path: "fun",
    url: 'https://docs.waifu.im/'
}

plugin.config = {
    removeFirstUrl: true
}

export default plugin