/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { prepareWAMessageMedia } from "baileys"
import { config } from "#root/config.js"

const AUTHOR = config.devName
const USAGE = 'format: ct <url_gambar>\ncontoh: ct https://contoh.com/gambar.jpg'

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, text, sock, jid } = ctx

    if (!text?.trim()) return await m.arashirep(USAGE)

    let url
    try {
        url = new URL(text.trim())
    } catch {
        return await m.arashirep('url ga valid bang')
    }

    const { imageMessage: i } = await prepareWAMessageMedia({
        image: { url }
    }, {
        upload: sock.waUploadToServer,
        mediaTypeOverride: 'thumbnail-link'
    })

    const contentUrl = "https://www.google.com"
    const content = "bla bla bla"

    return await sock.relayMessage(jid, {
        extendedTextMessage: {
            text: contentUrl + "\n" + content,
            matchedText: contentUrl,
            description: "sexy bot",
            title: "menu",
            previewType: 0,
            inviteLinkGroupTypeV2: 0,

            thumbnailDirectPath: i.directPath,
            thumbnailSha256: i.fileSha256,
            thumbnailEncSha256: i.fileEncSha256,
            mediaKey: i.mediaKey,

            mediaKeyTimestamp: i.mediaKeyTimestamp,
            thumbnailWidth: i.width,
            thumbnailHeight: i.height,

            jpegThumbnail: i.jpegThumbnail
        }
    }, {})
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "create thumbnail",
    commands: ["ct"],
    categories: ["main"],
    description: "bikin link preview custom pake thumbnail dari url gambar"
}

plugin.meta = {
    filename: "create-thumbnail.js",
    version: "2",
    author: "Kado",
    note: "rapihin struktur biar sama kayak plugin laen, tambah validasi url & pesan usage",
    path: "main"
}

export default plugin