/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, command } = ctx

    if (!q) return await m.arashirep('reply stiker yang mau diubah kak')

    if (q.content !== 'stickerMessage') return await m.arashirep('reply stiker untuk menggunakan perintah ini')

    const isAnimated = q.message.stickerMessage?.isAnimated

    const buffer = await q.download('buffer')

    if (command === 'tovid') {
        if (!isAnimated) return await m.arashirep('stiker ini bukan animasi, gunakan toimg')
        return await sock.sendMessage(jid, {
            video: buffer,
            mimetype: 'video/mp4',
            gifPlayback: true
        }, { quoted: m.raw })
    }

    // toimg
    if (isAnimated) return await m.arashirep('stiker animasi tidak bisa diubah ke gambar, gunakan tovid')

    await sock.sendMessage(jid, {
        image: buffer
    }, { quoted: m.raw })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "to image / to video",
    commands: ["toimg", "tovid"],
    categories: ["tools"],
    description: "ubah stiker jadi gambar atau video"
}

plugin.meta = {
    filename: "toimg.js",
    version: "1",
    author: "Kado",
    note: "gabut",
    path: "tools"
}

export default plugin