/**
 * @import {PluginCtx} from "../../types/types.js"
 */

import sharp from "sharp"
import { config } from "#root/config.js"
/**
 * 
 * @param {PluginCtx} ctx 
 * @returns {Promise<any>}
 */
async function run(ctx) {
    const { sock, q, m, jid, text, prefix, command } = ctx


    
    const isImage = q.content

    if (!isImage) {
        return await m.arashirep(`reply foto yang mau di-compress ya\n\ncontoh: *${prefix ? prefix + ' ' : ''}${command} 40* (reply ke foto)\n\nangka di belakang itu quality (1-100), default 50 kalau gak diisi`)
    }

    // quality bisa diatur lewat argumen, misal: .compress 30
    let quality = parseInt(text?.trim())
    if (isNaN(quality) || quality < 1 || quality > 100) quality = 50

    try {
        const buffer = await q.download("buffer")

        const compressed = await sharp(buffer)
            .resize({ width: 1024, withoutEnlargement: true })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer()

        const beforeKB = (buffer.length / 1024).toFixed(1)
        const afterKB = (compressed.length / 1024).toFixed(1)
        const ratio = (100 - (compressed.length / buffer.length) * 100).toFixed(1)

        return await sock.sendMessage(jid, {
            image: compressed,
            caption: `✅ berhasil di-compress\n\nukuran awal: ${beforeKB} KB\nukuran akhir: ${afterKB} KB\npenghematan: ${ratio}%\nquality: ${quality}`
        }, { quoted: m })
    } catch (err) {
        console.error(err)
        return await m.arashirep(`gagal compress gambar: ${err.message}`)
    }
}

const plugin = { run }

plugin.name = "compress"
plugin.commands = ["compress", "rz"]
plugin.categories = ["tools"]
plugin.description = "compress ukuran foto (reply ke foto)"

plugin.meta = {
    filename: "compress.js",
    author: config.devName,
    note: "",
    version: "1",
    path: "tools"
}

export default plugin