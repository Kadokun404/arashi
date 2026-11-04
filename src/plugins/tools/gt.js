/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { downloadMediaMessage } from "baileys"

const FAVICON_ARGS = ["fav", "favicon", "icon"]

const downloadFromThumbFields = async (src, q) => {
    const fakeImageMessage = {
        key: q.key,
        message: {
            imageMessage: {
                directPath: src.directPath || src.thumbnailDirectPath,
                mediaKey: src.mediaKey,
                fileEncSha256: src.fileEncSha256 || src.thumbnailEncSha256,
                fileSha256: src.fileSha256 || src.thumbnailSha256,
                height: src.height || src.thumbnailHeight,
                width: src.width || src.thumbnailWidth,
                mimetype: "image/jpeg"
            }
        }
    }
    return downloadMediaMessage(fakeImageMessage, "buffer")
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    if (!q) return await m.arashirep('reply pesan yang mau dijadiin gambar kak')
    if (q.content !== 'extendedTextMessage') return await m.arashirep('reply pesan teks (link preview) untuk menggunakan perintah ini')

    const wantFavicon = FAVICON_ARGS.includes(text?.trim().toLowerCase())
    const ext = q.message?.extendedTextMessage
    const favicon = ext?.faviconMMSMetadata

    if (wantFavicon) {
        if (!favicon?.thumbnailDirectPath) return await m.arashirep('❌ pesan ini gaada favicon nya')
        try {
            const buffer = await downloadFromThumbFields(favicon, q)
            return await sock.sendMessage(jid, { image: buffer }, { quoted: m })
        } catch (e) {
            return await m.arashirep(`❌ gagal download favicon: ${e.message}`)
        }
    }

    if (ext?.thumbnailDirectPath && ext?.mediaKey) {
        try {
            const buffer = await downloadFromThumbFields(ext, q)
            return await sock.sendMessage(jid, { image: buffer }, { quoted: m })
        } catch (e) {
            return await m.arashirep(`❌ gagal download thumbnail: ${e.message}`)
        }
    }

    const buff = ext?.jpegThumbnail
    if (!buff) return await m.arashirep('gaada thumbnail')
    await sock.sendMessage(jid, { image: Buffer.from(buff) }, { quoted: m })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "get thumbnail",
    commands: ["gt"],
    categories: ["tools"],
    description: "ambil gambar dari pesan yang di-reply. \"gt fav\"/\"gt icon\" buat ambil favicon nya kalau ada"
}

plugin.meta = {
    filename: "gt.js",
    version: "5",
    author: "Kado",
    note: "generalisasi: thumbnail besar (thumbnailDirectPath+mediaKey di root extendedTextMessage) sekarang didownload full-size lewat jalur yang sama kayak favicon, bukan cuma jpegThumbnail kecil",
    path: "tools"
}

export default plugin