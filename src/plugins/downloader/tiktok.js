/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { generateWAMessageFromContent, prepareWAMessageMedia } from 'baileys'
import { ttdl } from '#helper/tiktok.js'

const fmtNum = n => Number(n || 0).toLocaleString('id-ID')
const fmtDuration = sec => {
    const s = Math.floor(sec || 0)
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}
const sanitizeFileName = name => String(name || '').replace(/[\\/:*?"<>|\n\r]/g, '').trim() || 'audio'

async function searchTikTok(query) {
    const res = await fetch(`https://tikwm.com/api/feed/search?${new URLSearchParams({ keywords: query, count: 1 })}`, {
        signal: AbortSignal.timeout(20000)
    })
    const data = await res.json()
    const v = data?.data?.videos?.[0]
    if (data?.code !== 0 || !v) throw new Error('hasil tidak ditemukan')
    return `https://www.tiktok.com/@${v.author.unique_id}/video/${v.video_id}`
}

async function getTikwm(url) {
    const res = await fetch(`https://tikwm.com/api/?${new URLSearchParams({ url, hd: 1 })}`, {
        signal: AbortSignal.timeout(20000)
    })
    const data = await res.json()
    if (data?.code !== 0 || !data?.data) throw new Error('gagal mengambil data tiktok (tikwm)')
    return data.data
}

// samain bentuk hasil tikwm ke bentuk yang sama kayak ttdl, biar pengiriman di bawah gak perlu di-dobel
function normalizeTikwm(res) {
    return {
        caption: res.title || '',
        user: { username: res.author?.unique_id || '-', fullname: res.author?.nickname || '-' },
        stats: {
            views: Number(res.play_count || res.play || res.views || 0),
            likes: Number(res.digg_count || 0),
            comments: Number(res.comment_count || 0),
            shares: Number(res.share_count || 0)
        },
        duration: Number(res.duration || 0),
        video: res.play ? [{ url: res.play }] : [],
        image: Array.isArray(res.images) ? res.images.map(url => ({ url })) : [],
        music: res.music ? { url: res.music, title: res.music_info?.title || '' } : null
    }
}

function caption(data) {
    const title = (data.caption || '-').replace(/\s+/g, ' ').trim()
    return `— DOWNLOADER TIKTOK —
Judul   : ${title.length > 150 ? title.slice(0, 150) + '...' : title}
Uploader: ${data.user?.fullname || data.user?.username || '-'}
Durasi  : ${fmtDuration(data.duration)}
Views   : ${fmtNum(data.stats?.views)}
Likes   : ${fmtNum(data.stats?.likes)}
Komentar: ${fmtNum(data.stats?.comments)}`
}

async function sendAlbum(ctx, images, cap) {
    const { sock, m, jid } = ctx
    const medias = await Promise.all(
        images.map(img => prepareWAMessageMedia({ image: { url: img.url } }, { upload: sock.waUploadToServer }))
    )

    const albumMessage = generateWAMessageFromContent(jid, {
        messageContextInfo: { messageSecret: Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256))) },
        albumMessage: { expectedImageCount: medias.length, expectedVideoCount: 0 }
    }, { quoted: m })

    await sock.relayMessage(jid, albumMessage.message, { messageId: albumMessage.key.id })

    for (let i = 0; i < medias.length; i++) {
        const imgMsg = generateWAMessageFromContent(jid, {
            imageMessage: { ...medias[i].imageMessage, caption: i === 0 ? cap : undefined }
        }, { quoted: m })

        imgMsg.message.messageContextInfo = {
            messageAssociation: { associationType: 1, parentMessageKey: albumMessage.key }
        }

        await sock.relayMessage(jid, imgMsg.message, { messageId: imgMsg.key.id })
        await new Promise(r => setTimeout(r, 800))
    }
}

async function sendResult(ctx, data) {
    const { sock, m, jid } = ctx
    const cap = caption(data)

    if (data.image.length) {
        await sendAlbum(ctx, data.image, cap)
    } else if (data.video.length) {
        await sock.sendMessage(jid, { video: { url: data.video[0].url }, caption: cap }, { quoted: m })
    } else {
        throw new Error('media tidak ditemukan')
    }

    if (data.music?.url) {
        await sock.sendMessage(jid, {
            audio: { url: data.music.url },
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: `${sanitizeFileName(data.music.title || data.caption)}.mp3`
        }, { quoted: m })
    }
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, q, text } = ctx
    const input = (text || q?.text || '').trim()

    if (!input) return await m.arashirep('mn link tt ny? bisa juga ketik judul/keyword videonya')

    await m.react('⏳')

    const url = /^https?:\/\//i.test(input) ? input : null

    try {
        let data
        try {
            data = await ttdl(url || input)
        } catch (primaryErr) {
            const fallbackUrl = url || await searchTikTok(input)
            const raw = await getTikwm(fallbackUrl)
            data = normalizeTikwm(raw)
        }

        await sendResult(ctx, data)
        await m.react('✅')
    } catch (e) {
        await m.react('❌')
        return await m.arashirep(`error: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: 'tiktok downloader',
    commands: ['tt', 'tiktok'],
    categories: ['downloader'],
    description: 'download video/foto/album tiktok beserta audio. support tiktok.com, vt/vm, tt.site, dan keyword search'
}

plugin.meta = {
    filename: 'tiktok.js',
    version: '6',
    author: 'Kado',
    note: 'primary: helper/tiktok.js (ttdl, no-watermark+comment+caption lengkap), fallback: tikwm.com kalau ttdl gagal',
    path: 'downloader'
}

export default plugin
