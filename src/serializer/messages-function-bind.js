/**
 * @import {WASocket, WAMessage} from "baileys"
 */
import { downloadMediaMessage } from "baileys"
import crypto from "crypto"

const BOT_TITLE_DESC = "Arashi"
const BOT_LINK = "https://arashi.kadokun.com"
const PFP_CACHE_TTL = 10 * 60 * 1000 // 10 menit

const FALLBACK_THUMBNAIL = Buffer.from(
    "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",
    "base64"
)

const pfpCache = new Map()

async function getProfileThumbnail(sock, jid) {
    const cached = pfpCache.get(jid)
    if (cached && Date.now() - cached.time < PFP_CACHE_TTL) return cached.buffer

    try {
        const url = await sock.profilePictureUrl(jid, "preview")
        const res = await fetch(url)
        if (!res.ok) throw new Error(`http ${res.status}`)
        const buffer = Buffer.from(await res.arrayBuffer())
        pfpCache.set(jid, { buffer, time: Date.now() })
        return buffer
    } catch {
        pfpCache.set(jid, { buffer: null, time: Date.now() })
        return null
    }
}

/**
 * 
 * @param {"buffer" | "stream"} dataType 
 * @returns 
 */
function download(dataType) {
    /** @type {WAMessage}*/
    const m = this
    return downloadMediaMessage(m, dataType)
}

function react(emoji) {
    /**@type {WASocket}  */
    const sock = this.sock

    /** @type {WAMessage}*/
    const m = this
    return sock.sendMessage(m.key.remoteJid, {
        react: {
            key: m.key,
            text: emoji
        }
    })
}

function reply(text) {
    /**@type {WASocket}  */
    const sock = this.sock

    /** @type {WAMessage}*/
    const m = this
    return sock.sendMessage(m.key.remoteJid, {
        text
    }, { quoted: this })
}

async function arashirep(text) {
    /**@type {WASocket}  */
    const sock = this.sock

    /** @type {WAMessage}*/
    const m = this

    const jid = m.key.remoteJid
    const senderJid = m.sender || m.key.participant || m.key.remoteJid
    const thumb = (await getProfileThumbnail(sock, senderJid)) || FALLBACK_THUMBNAIL
    const body = String(text).includes(BOT_LINK) ? text : `${BOT_LINK}\n\n${text}`

    return await sock.relayMessage(jid, {
        extendedTextMessage: {
            text: body,
            title: m.contact?.name || BOT_TITLE_DESC,
            description: BOT_TITLE_DESC,
            matchedText: BOT_LINK,
            previewType: 0,
            jpegThumbnail: thumb,
            contextInfo: {
                stanzaId: m.key.id,
                participant: m.key.participant || m.key.remoteJid,
                quotedMessage: m.message
            }
        },
        messageContextInfo: {
            messageSecret: crypto.randomBytes(32)
        }
    }, {})
}

function del () {
    /**@type {WASocket}  */
    const sock = this.sock

    /** @type {WAMessage}*/
    const m = this
    return sock.sendMessage(m.key.remoteJid, {
        delete : this.key
    })
}

export { download, react, reply, arashirep, del }
