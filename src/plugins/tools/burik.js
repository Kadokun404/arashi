/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import sharp from 'sharp'
import util from 'util'
import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import { config } from "#root/config.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, q, jid } = ctx

    // Cek apakah pesan/reply adalah gambar atau stiker
    const msg = (q?.content === 'imageMessage' || q?.content === 'stickerMessage') ? q : 
                (m?.content === 'imageMessage' || m?.content === 'stickerMessage') ? m : null

    if (!msg) return await m.arashirep('❌ Reply atau kirim gambar/stiker yang mau dibikin burik!')

    const isSticker = msg.content === 'stickerMessage'

    try {
        const buffer = await msg.download("buffer")
        
        const image = sharp(buffer)
        const metadata = await image.metadata()
        
        // Sesuaikan ukuran ke ~30% atau minimal 144px (vibe 144p)
        const newWidth = Math.max(144, Math.floor((metadata.width || 800) * 0.30))

        // Proses pemburikan ala 144p
        const burikBuffer = await image
            .resize({ width: newWidth }) // Pangkas resolusi secukupnya
            .blur(1.2)                   // Blur tipis aja
            .jpeg({ quality: 15 })       // Kualitas rendah tapi masih kelihatan
            .toBuffer()

        if (isSticker) {
            const sticker = new Sticker(burikBuffer, {
                pack: config.botName,
                author: config.devName,
                type: StickerTypes.FULL,
                quality: 20 // Kualitas stiker disesuaikan
            })
            
            await sock.sendMessage(jid, { 
                sticker: await sticker.toBuffer() 
            }, { quoted: m })

        } else {
            await sock.sendMessage(jid, { 
                image: burikBuffer, 
                caption: 'Nih udah turun kasta ke 144p 🗿' 
            }, { quoted: m })
        }

    } catch (error) {
        await m.arashirep(`❌ *ERROR*\n\n\`\`\`js\n${util.inspect(error, { depth: 1 })}\n\`\`\``)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "Burikin Image & Sticker (144p)",
    commands: ["burikin", "buramkan", "resize", "burik"],
    categories: ["tools"],
    description: "Bikin gambar atau stiker jadi buram kualitas 144p"
}

plugin.meta = {
    filename: "burik.js",
    version: "3",
    author: "Kado",
    note: "Adjusted parameters for 144p look (visible but blurry)",
    path: "tools"
}

export default plugin