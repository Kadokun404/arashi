/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { config } from "#root/config.js"
import { createSticker } from "#root/src/helper/sticker-converter.js"

function parseMeta(input) {
    const s = input.trim()
    if (!s) return { pack: "", author: "" }

    let i = s.indexOf("|")
    if (i === -1) i = s.search(/[,.]/)

    if (i === -1) return { pack: s, author: "" }

    return {
        pack: s.slice(0, i).trim(),
        author: s.slice(i + 1).trim()
    }
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text, command } = ctx

    const mediaTypes = ['imageMessage', 'videoMessage', 'stickerMessage']

    let target = null

    if (q && mediaTypes.includes(q.content)) target = q
    else if (mediaTypes.includes(m.content)) target = m

    const isSwm = String(command ?? "").toLowerCase() === "swm"

    if (!target) {
        return await m.arashirep(
            isSwm
                ? 'mn fto/vid/stiker ny?\ncontoh: swm pack | author\nswm kado\nswm | kado'
                : 'mn fto/vid/stiker ny? pke flag -f biar g di crop/dipotong'
        )
    }

    const raw = text || ''
    const isFull = /(^|\s)-f(\s|$)/.test(raw)
    const clean = raw.replace(/(^|\s)-f(?=\s|$)/g, ' ').trim()

    let pack = config.botName
    let author = config.devName

    if (isSwm) {
        const meta = parseMeta(clean)
        if (meta.pack) pack = meta.pack
        if (meta.author) author = meta.author
    }

    const isVideo = target.content === 'videoMessage' ||
                    Boolean(target.message?.videoMessage) ||
                    Boolean(target.mimetype && target.mimetype.startsWith('video/'))

    try {
        const buffer = await target.download('buffer')
        if (!buffer || !buffer.length) {
            return await m.arashirep('❌ Gagal mengunduh media dari pesan.')
        }

        const stickerBuffer = await createSticker(buffer, {
            isVideo,
            isFull,
            pack,
            author
        })

        await sock.sendMessage(jid, {
            sticker: stickerBuffer
        }, { quoted: m })
    } catch (e) {
        return await m.arashirep(`❌ Gagal membuat stiker: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "sticker maker",
    commands: ["s", "sticker", "stiker", "swm"],
    categories: ["maker"],
    description: "buat stiker dari gambar/video/stiker (video max 5 detik anti-corrupt), -f buat full. swm pack | author buat ganti watermark"
}

plugin.meta = {
    filename: "sticker.js",
    version: "4",
    author: "Kado x Arashi",
    note: "fix video to sticker anti corrupt via ffmpeg direct & node-webpmux (max duration 5 detik)",
    path: "maker"
}

export default plugin
