/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q } = ctx

    if (!q) return await m.arashirep('balas stiker yang ingin kamu kirim ulang sebagai premium')

    if (q.content !== 'stickerMessage') return await m.arashirep('balas stiker untuk menggunakan perintah ini')

    try {
        const s = q.message.stickerMessage

        const msg = {
            messageContextInfo: {
                messageSecret: "rme8dNt3wUoOXIqw5rIpoHsnCSGJtcy/kMJVsBfyukA="
            },
            lottieStickerMessage: {
                message: {
                    stickerMessage: {
                        url: s.url,
                        fileSha256: s.fileSha256,
                        fileEncSha256: s.fileEncSha256,
                        mediaKey: s.mediaKey,
                        mimetype: s.mimetype,
                        height: s.height,
                        width: s.width,
                        directPath: s.directPath,
                        fileLength: s.fileLength,
                        mediaKeyTimestamp: s.mediaKeyTimestamp,
                        isAnimated: s.isAnimated || false,
                        stickerSentTs: s.stickerSentTs || Date.now(),
                        isAvatar: s.isAvatar || false,
                        isAiSticker: s.isAiSticker || false,
                        isLottie: s.isLottie || false,
                        premium: 1
                    }
                }
            }
        }

        await sock.relayMessage(jid, msg, {})
    } catch (e) {
        await m.arashirep('maaf, terjadi kesalahan saat memproses stiker. coba lagi nanti!')
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "sticker premium",
    commands: ["sprem"],
    categories: ["tools"],
    description: "kirim ulang stiker sebagai premium"
}

plugin.meta = {
    filename: "sprem.js",
    version: "1.0.0",
    author: "Kado",
    note: "gabut",
    path: "tools"
}

export default plugin