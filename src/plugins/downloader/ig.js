/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { generateWAMessageFromContent, prepareWAMessageMedia } from 'baileys'

const IG_REGEX = /(https?:\/\/(?:www\.)?instagram\.com\/\S+)/i

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    const source = text || q?.text || ''
    const match = source.match(IG_REGEX)

    if (!match) return await m.arashirep('masukkan atau reply url instagram')

    const url = match[1]

    await m.arashirep('mengambil data...')

    const res = await fetch(`https://api.nexray.eu.cc/downloader/instagram?url=${encodeURIComponent(url)}`)
    const json = await res.json()

    if (!json.status || !json.result?.length) return await m.arashirep('❌ gagal mengambil data, url tidak valid atau konten private')

    const results = json.result

    const videos = results.filter(r => r.type === 'video')
    const images = results.filter(r => r.type === 'image')

    if (videos.length === 1 && images.length === 0) {
        // single video
        await sock.sendMessage(jid, {
            video: { url: videos[0].url }
        }, { quoted: m.raw })

    } else if (images.length > 0 && videos.length === 0) {
        // slide foto
        const medias = await Promise.all(
            images.map(r =>
                prepareWAMessageMedia({ image: { url: r.url } }, { upload: sock.waUploadToServer })
            )
        )

        const albumMessage = generateWAMessageFromContent(jid, {
            messageContextInfo: {
                messageSecret: Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)))
            },
            albumMessage: {
                expectedImageCount: medias.length,
                expectedVideoCount: 0
            }
        }, { quoted: m.raw })

        await sock.relayMessage(jid, albumMessage.message, { messageId: albumMessage.key.id })

        for (let i = 0; i < medias.length; i++) {
            const imgMsg = generateWAMessageFromContent(jid, {
                imageMessage: {
                    ...medias[i].imageMessage
                }
            }, { quoted: m.raw })

            imgMsg.message.messageContextInfo = {
                messageAssociation: {
                    associationType: 1,
                    parentMessageKey: albumMessage.key
                }
            }

            await sock.relayMessage(jid, imgMsg.message, { messageId: imgMsg.key.id })
        }

    } else {
        // mixed / multiple video — kirim satu-satu
        for (const item of results) {
            if (item.type === 'video') {
                await sock.sendMessage(jid, {
                    video: { url: item.url }
                }, { quoted: m.raw })
            } else if (item.type === 'image') {
                await sock.sendMessage(jid, {
                    image: { url: item.url }
                }, { quoted: m.raw })
            }
        }
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "instagram downloader",
    commands: ["ig", "instagram"],
    categories: ["downloader"],
    description: "download video/foto instagram, support reply"
}

plugin.meta = {
    filename: "ig.js",
    version: "1",
    author: "Kado",
    note: "",
    path: "downloader"
}

export default plugin