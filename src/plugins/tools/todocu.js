/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

const EXT_MAP = {
    imageMessage: { ext: 'jpg', mimetype: 'image/jpeg' },
    videoMessage: { ext: 'mp4', mimetype: 'video/mp4' },
    audioMessage: { ext: 'mp3', mimetype: 'audio/mpeg' },
    stickerMessage: { ext: 'webp', mimetype: 'image/webp' }
}

const TEXT_TYPES = ['conversation', 'extendedTextMessage']

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    let target = null
    if (q && EXT_MAP[q.content]) target = q
    else if (EXT_MAP[m.content]) target = m

    // cek target text (dari reply atau dari argumen command)
    let textTarget = null
    if (q && TEXT_TYPES.includes(q.content)) textTarget = q
    else if (text && text.trim().length > 0) textTarget = { text: text.trim() }

    if (!target && !textTarget) {
        return await m.arashirep('reply/kirim media (gambar/video/audio/stiker), atau reply/ketik teks, kak')
    }

    let buffer, ext, mimetype

    if (target) {
        ;({ ext, mimetype } = EXT_MAP[target.content])
        buffer = await target.download('buffer')
    } else {
        // ambil isi teks: dari reply (q.text / q.body) atau dari argumen command
        const content = textTarget.text ?? textTarget.body ?? ''
        if (!content) return await m.arashirep('teksnya kosong kak')

        buffer = Buffer.from(content, 'utf-8')
        ext = 'txt'
        mimetype = 'text/plain'
    }

    await sock.sendMessage(jid, {
        document: buffer,
        mimetype,
        fileName: `file-${Date.now()}.${ext}`
    }, { quoted: m.raw })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "to document",
    commands: ["todocu", "todoc"],
    categories: ["tools"],
    description: "ubah media/teks jadi dokumen"
}

plugin.meta = {
    filename: "todocu.js",
    version: "1",
    author: "Kado",
    note: "gabut",
    path: "tools"
}

export default plugin