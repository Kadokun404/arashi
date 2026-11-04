/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import crypto from 'crypto'
import { prepareWAMessageMedia } from 'baileys'
import { Toolkit } from '#helper/toolkit.js'

const MAX_SECONDS = 20

const USAGE = `📸 *fotolive* — gabungin foto + video jadi WhatsApp Live Photo (motion photo)

*Videonya bisa dari:*
• Kirim langsung, caption *fotolive*
• Reply video yang udah ada, caption teks *fotolive*
(max ${MAX_SECONDS} detik, kalo gak dikasih foto, still-nya diambil otomatis dari frame pertama video)

*Foto sendiri itu opsional, caranya (pilih salah satu):*
• Reply foto sambil kirim videonya (foto ke-attach, video di-reply)
• Kirim video-nya sambil reply ke foto (video ke-attach, foto di-reply)
• Atau kirim/reply gambar caption *fotolive* duluan, nanti kirim video-nya reply ke foto itu`

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, q, sock, jid } = ctx

    const mIsImage = m.content === 'imageMessage'
    const mIsVideo = m.content === 'videoMessage'
    const qIsImage = q?.content === 'imageMessage'
    const qIsVideo = q?.content === 'videoMessage'

  
    const videoRaw = mIsVideo ? m.message.videoMessage : (qIsVideo ? q.message.videoMessage : null)

    
    if (!videoRaw) {

        if (mIsImage) {
            return await m.arashirep(
                `✅ Foto sudah disimpan.\n\nSekarang kirim *video* (max ${MAX_SECONDS} detik) dengan caption *fotolive*, sambil reply ke foto ini ya.\n\n(atau abaikan aja pesan ini, kirim video caption *fotolive* tanpa reply juga bisa — foto still-nya bakal diambil otomatis dari frame video)`
            )
        }

        return await m.arashirep(USAGE)
    }

    if (videoRaw.gifPlayback) {
        return await m.arashirep('Video-nya jangan yang mode GIF-playback ya, kirim video biasa.')
    }

    const seconds = Number(videoRaw.seconds || 0)
    if (seconds > MAX_SECONDS) {
        return await m.arashirep(`Videonya kepanjangan (${seconds} detik). Maksimal ${MAX_SECONDS} detik ya.`)
    }


    const imageRaw = mIsVideo
        ? (qIsImage ? q.message.imageMessage : null)
        : (mIsImage ? m.message.imageMessage : null)

    
    const videoTarget = mIsVideo ? m : q

    await m.react('⏳')

    try {
        let image

        if (imageRaw) {
            image = { ...imageRaw }
        } else {
           
            const videoBuffer = await videoTarget.download('buffer')
            let frameBuffer = await Toolkit.getMp4Preview(videoBuffer, { time: 0, result: 'buffer' })

           
            if (typeof frameBuffer === 'string') {
                frameBuffer = Buffer.from(frameBuffer, 'base64')
            }

            if (!frameBuffer) {
                await m.react('❌')
                return await m.arashirep('Gagal ambil frame dari video (ffmpeg gak ketemu/gagal). Coba pake foto sendiri: reply/kirim foto barengan video-nya, caption *fotolive*.')
            }

            const media = await prepareWAMessageMedia(
                { image: frameBuffer },
                { upload: sock.waUploadToServer }
            )

            image = media.imageMessage
        }

        const newParentId = await sock.relayMessage(
            jid,
            {
                imageMessage: image,
                messageContextInfo: {
                    messageSecret: crypto.randomBytes(32)
                }
            },
            {}
        )

        await sock.relayMessage(
            jid,
            {
                videoMessage: { ...videoRaw },
                messageContextInfo: {
                    messageSecret: crypto.randomBytes(32),
                    messageAssociation: {
                        associationType: 12,
                        parentMessageKey: {
                            remoteJid: jid,
                            fromMe: true,
                            id: newParentId
                        }
                    }
                }
            },
            {
                additionalNodes: [
                    {
                        tag: 'meta',
                        attrs: { message_association_type: 'motion_photo' }
                    }
                ]
            }
        )

        await m.react('✅')
    } catch (e) {
        await m.react('❌')
        return await m.arashirep(`Gagal bikin fotolive: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: 'fotolive',
    commands: ['fotolive', 'livephoto'],
    categories: ['maker'],
    description: 'Gabungin foto + video max 20 detik jadi WhatsApp Live Photo. Video boleh dikirim langsung atau di-reply, foto sendiri opsional (kalo gak ada, diambil otomatis dari frame video)'
}

plugin.meta = {
    filename: 'fotolive.js',
    version: '4.0.0',
    author: 'Kado',
    note: 'yayaya',
    path: 'maker'
}

export default plugin