/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import util from 'util'
import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import { config } from "#root/config.js"
import { uploadBuffer } from "#helper/upload-image.js" // Memanggil uploader internal kamu

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q } = ctx
    let { text } = ctx

    if (!text) return await m.arashirep('❌ Masukkan teks!\nContoh: .smeme atas | bawah [-crop]')


    const isCrop = text.includes('-crop')
    text = text.replace(/-crop/gi, '').trim()

    
    const [top = '_', bottom = '_'] = text.split(/[|,]/).map(t => encodeURIComponent(t.trim()) || '_')

    
    const msg = (q?.content === 'imageMessage' || q?.content === 'stickerMessage') ? q : 
                (m?.content === 'imageMessage' || m?.content === 'stickerMessage') ? m : null

    if (!msg) return await m.arashirep('❌ Reply gambar/stiker yang ingin dijadikan background!')

    try {
        const buffer = await msg.download("buffer")
        
        
        const upload = await uploadBuffer(buffer, 'jpg')
        if (!upload?.url) throw new Error("Gagal mendapatkan URL dari uploader helper")
        
        
        const memeUrl = `https://api.memegen.link/images/custom/${top}/${bottom}.png?background=${upload.url}`

        const sticker = new Sticker(memeUrl, {
            pack: config.botName,
            author: config.devName,
            type: isCrop ? StickerTypes.CROPPED : StickerTypes.FULL,
            quality: 70
        })

        await sock.sendMessage(jid, { sticker: await sticker.toBuffer() }, { quoted: m })

    } catch (error) {
        await m.arashirep(`eror\n\n\`\`\`js\n${util.inspect(error, { depth: 1 })}\n\`\`\``)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "smeme maker",
    commands: ["smeme"],
    categories: ["maker"],
    description: "Buat stiker meme dengan memegen.link (Gunakan -crop untuk 1:1)"
}

plugin.meta = {
    filename: "smeme.js",
    version: "6",
    author: "Kado",
    note: "Memakai helper uploadBuffer internal sebagai media uploader.",
    path: "maker"
}

export default plugin