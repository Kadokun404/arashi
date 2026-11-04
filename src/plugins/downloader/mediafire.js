/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text } = ctx

    if (!text || !text.includes('mediafire.com'))
        return await m.arashirep('kirim link mediafire nya\ncontoh: mf https://www.mediafire.com/file/xxx')

    const statusMsg = await m.arashirep('⏳ mengambil link download...')

    const res = await fetch(`https://api.nexray.eu.cc/downloader/mediafire?url=${encodeURIComponent(text.trim())}`)
    const json = await res.json()

    if (!json.status || !json.result?.download_url) {
        return await sock.sendMessage(jid, {
            text: '❌ gagal ambil link, pastikan link mediafire valid',
            edit: statusMsg.key
        })
    }

    const { filename, filesize, mimetype, uploaded, download_url } = json.result

    return await sock.sendMessage(jid, {
        document: { url: download_url },
        mimetype: mimetype || 'application/octet-stream',
        fileName: filename,
        caption: `📁 ${filename}\n📦 ${filesize}\n📅 ${uploaded}`
    }, { quoted: m.raw })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "mediafire downloader",
    commands: ["mf", "mediafire"],
    categories: ["downloader"],
    description: "ambil link download dari mediafire"
}

plugin.meta = {
    filename: "mediafire.js",
    version: "1",
    author: "Kado",
    note: "",
    path: "downloader"
}

export default plugin