/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { generateWAMessageFromContent, prepareWAMessageMedia } from 'baileys'
import { vdrop } from '#helper/vdrop.js'

const fmtNum = n => Number(n || 0).toLocaleString('id-ID')

function buildCaption(data) {
    if (data.platform === 'Twitter/X') {
        const name = data.author?.name || '-'
        const uname = data.author?.username ? `(@${data.author.username})` : ''
        const verified = data.author?.is_blue ? ' ✔️' : ''
        const text = (data.text || '').trim()
        const stats = data.stats || {}

        let cap = `— *VIDEODROPPER (${data.platform})* —\n`
        cap += `👤 *${name}* ${uname}${verified}\n`
        if (text) cap += `\n${text}\n`
        cap += `\n❤️ ${fmtNum(stats.likes)}  🔁 ${fmtNum(stats.retweets)}  💬 ${fmtNum(stats.replies)}${stats.views ? `  👁️ ${fmtNum(stats.views)}` : ''}`
        return cap.trim()
    }

    return `— *VIDEODROPPER (${data.platform || 'Downloader'})* —\n🔗 ${data.url}`
}

function collectMediaItems(data) {
    const videos = []
    const images = []
    const seen = new Set()

    for (const v of data.videos || []) {
        if (v?.url && !seen.has(v.url)) {
            seen.add(v.url)
            videos.push(v)
        }
    }

    for (const img of data.images || []) {
        if (img?.url && !seen.has(img.url)) {
            seen.add(img.url)
            images.push(img)
        }
    }

    for (const m of data.media || []) {
        if (!m?.url || seen.has(m.url)) continue
        seen.add(m.url)
        const t = String(m.type || '').toLowerCase()
        if (t === 'image' || t === 'photo' || /\.(jpe?g|png|webp)(\?|$)/i.test(m.url)) {
            images.push({ url: m.url, thumbnail: m.thumbnail || null })
        } else {
            videos.push({ url: m.url, thumbnail: m.thumbnail || null })
        }
    }

    return { videos, images }
}

async function sendImageAlbum(ctx, images, caption) {
    const { sock, m, jid } = ctx
    const medias = await Promise.all(
        images.map(img => prepareWAMessageMedia({ image: { url: img.url } }, { upload: sock.waUploadToServer }))
    )

    const albumMessage = generateWAMessageFromContent(jid, {
        messageContextInfo: {
            messageSecret: Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)))
        },
        albumMessage: {
            expectedImageCount: medias.length,
            expectedVideoCount: 0
        }
    }, { quoted: m })

    await sock.relayMessage(jid, albumMessage.message, { messageId: albumMessage.key.id })

    for (let i = 0; i < medias.length; i++) {
        const imgMsg = generateWAMessageFromContent(jid, {
            imageMessage: {
                ...medias[i].imageMessage,
                caption: i === 0 ? caption : undefined
            }
        }, { quoted: m })

        imgMsg.message.messageContextInfo = {
            messageAssociation: {
                associationType: 1,
                parentMessageKey: albumMessage.key
            }
        }

        await sock.relayMessage(jid, imgMsg.message, { messageId: imgMsg.key.id })
        if (i < medias.length - 1) await new Promise(r => setTimeout(r, 800))
    }
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    const source = (text || q?.text || '').trim()
    const match = source.match(/https?:\/\/[^\s"'<>]+/i)

    if (!match) {
        return await m.arashirep(
            'masukkan atau reply link dengan *vdrop*\n' +
            'support: Instagram (Post/Reels/Carousel/Story), Twitter/X, Facebook, dll.\n\n' +
            'contoh:\nvdrop https://www.instagram.com/p/xxxx'
        )
    }

    const url = match[0]
    await m.react('⏳')

    try {
        const res = await vdrop(url)

        if (!res.status || !res.data) {
            throw new Error(res.error || 'Gagal mengambil data dari URL tersebut')
        }

        const data = res.data
        const caption = buildCaption(data)
        const { videos, images } = collectMediaItems(data)

        if (videos.length === 0 && images.length === 0) {
            if (data.platform === 'Twitter/X' && data.text) {
                await m.arashirep(caption)
                await m.react('✅')
                return
            }
            throw new Error('Media tidak ditemukan atau konten bersifat private')
        }

        if (videos.length === 1 && images.length === 0) {
            await sock.sendMessage(jid, {
                video: { url: videos[0].url },
                caption
            }, { quoted: m })
        } else if (images.length === 1 && videos.length === 0) {
            await sock.sendMessage(jid, {
                image: { url: images[0].url },
                caption
            }, { quoted: m })
        } else if (images.length > 1 && videos.length === 0) {
            await sendImageAlbum(ctx, images, caption)
        } else {
            let first = true
            for (const v of videos) {
                await sock.sendMessage(jid, {
                    video: { url: v.url },
                    caption: first ? caption : undefined
                }, { quoted: m })
                first = false
            }
            for (const img of images) {
                await sock.sendMessage(jid, {
                    image: { url: img.url },
                    caption: first ? caption : undefined
                }, { quoted: m })
                first = false
            }
        }

        await m.react('✅')
    } catch (e) {
        await m.react('❌')
        return await m.arashirep(`❌ gagal: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: 'videodropper downloader',
    commands: ['vdrop', 'videodropper'],
    categories: ['downloader'],
    description: 'AIO downloader (Instagram Post/Reels/Carousel/Story, Twitter/X, Facebook, dll) via VideoDropper, support link & reply link'
}

plugin.meta = {
    filename: 'vdrop.js',
    version: '1.0.0',
    author: 'JH a.k.a Dhika',
    note: 'Scraper AIO VideoDropper (helper/vdrop.js)',
    path: 'downloader'
}

export default plugin
