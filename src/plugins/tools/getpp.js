/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { generateWAMessageFromContent, prepareWAMessageMedia } from 'baileys'
import { contactStore } from "#store/contact-store.js"

/**
 * resolve semua target dari ctx (reply + semua mention), gak dibatesin jumlahnya
 * @param {PluginCtx} ctx
 * @returns {{ jid: string, name: string|undefined }[]}
 */
function resolveTargets(ctx) {
    const { m, q } = ctx
    const targets = new Map()

    // reply ke orang
    if (q?.contact?.lid) {
        targets.set(q.contact.lid, { jid: q.contact.pn || q.contact.lid, name: q.contact.name })
    }

    // semua mention / tag
    const mentionedJid = m?.message?.[m?.content]?.contextInfo?.mentionedJid || []
    for (const lid of mentionedJid) {
        if (targets.has(lid)) continue
        const contact = contactStore.getByLid(lid)
        targets.set(lid, { jid: contact?.pn || lid, name: contact?.name })
    }

    return [...targets.values()]
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid } = ctx

    const targets = resolveTargets(ctx)

    if (!targets.length) return await m.arashirep('reply atau tag orang yang mau diambil pp nya kak')

    const images = []
    const failed = []

    for (const target of targets) {
        const ppUrl = await sock.profilePictureUrl(target.jid, 'image').catch(() => null)
        if (ppUrl) images.push({ url: ppUrl, jid: target.jid })
        else failed.push(target.jid)
    }

    if (!images.length) return await m.arashirep('gagal ambil pp, semua target private atau gak ada pp')

    if (images.length === 1) {
        await sock.sendMessage(jid, {
            image: { url: images[0].url },
            caption: `pp dari @${images[0].jid.split('@')[0]}`,
            mentions: [images[0].jid]
        }, { quoted: m.raw })
    } else {
        const medias = await Promise.all(
            images.map(img =>
                prepareWAMessageMedia({ image: { url: img.url } }, { upload: sock.waUploadToServer })
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
                imageMessage: medias[i].imageMessage
            }, { quoted: m.raw })

            imgMsg.message.messageContextInfo = {
                messageAssociation: {
                    associationType: 1,
                    parentMessageKey: albumMessage.key
                }
            }

            await sock.relayMessage(jid, imgMsg.message, { messageId: imgMsg.key.id })
            await new Promise(r => setTimeout(r, 700))
        }
    }

    if (failed.length) {
        await m.arashirep(
            `gagal ambil pp dari: ${failed.map(f => `@${f.split('@')[0]}`).join(', ')}`,
            { mentions: failed }
        )
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "get profile picture",
    commands: ["getpp"],
    categories: ["tools"],
    description: "ambil foto profil dengan reply atau tag orang, kirim album kalau lebih dari 1"
}

plugin.meta = {
    filename: "getpp.js",
    version: "4",
    author: "Kado",
    note: "gabut",
    path: "tools"
}

export default plugin