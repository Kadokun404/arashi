/**
 * @import {WASocket, WAMessage} from "baileys"
 */
import { downloadMediaMessage } from "baileys"
import crypto from "crypto"
import fs from "fs"
import path from "path"
import { themeManager } from "#manager/theme-manager.js"
import { config } from "#root/config.js"

const BOT_TITLE_DESC = "Arashi"
const BOT_LINK = "https://arashi.kadokun.com"
const THUMB_PATH = path.join(process.cwd(), "assets", "menu-thumbnail.jpg")
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
 * Normalisasi input media menjadi bentuk yang didukung Baileys
 * (Buffer, string path lokal, string URL http/https, atau object { url })
 * @param {any} input
 * @returns {any}
 */
function toBaileysMedia(input) {
    if (!input) return input
    if (Buffer.isBuffer(input) || (input instanceof Uint8Array)) return Buffer.from(input)
    if (typeof input === "string") {
        if (input.startsWith("http://") || input.startsWith("https://")) {
            return { url: input }
        }
        if (fs.existsSync(input)) {
            return fs.readFileSync(input)
        }
    }
    return input
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

async function arashirep(text, options = {}) {
    /**@type {WASocket}  */
    const sock = this.sock

    /** @type {WAMessage}*/
    const m = this

    let bodyText = text
    let opts = options || {}
    if (typeof text === "object" && text !== null && !Array.isArray(text) && !Buffer.isBuffer(text)) {
        opts = { ...text, ...options }
        bodyText = opts.text || opts.caption || opts.body || ""
    }
    bodyText = String(bodyText ?? "")

    const jid = m.key.remoteJid
    const senderJid = m.sender || m.key.participant || m.key.remoteJid

    // Ambil theme data (hanya untuk URL & Description)
    const theme = themeManager?.getData?.() || {}
    const themeExt = theme?.message?.extendedTextMessage || {}

    // Resolusi URL: opts.url -> theme.replyUrl -> theme.url -> config.menuUrl -> BOT_LINK
    const targetUrl = opts.url || theme.replyUrl || theme.url || config.menuUrl || BOT_LINK

    // Resolusi Deskripsi: opts.desc / opts.description -> theme.replyDescription -> theme.description -> BOT_TITLE_DESC
    const targetDesc = opts.desc || opts.description || theme.replyDescription || theme.description || BOT_TITLE_DESC

    // Judul WAJIB nama user (tidak boleh diubah/dioverride oleh tema)
    const targetTitle = m.contact?.name || m.pushName || "User"

    // Thumbnail WAJIB foto profil (pp) user (JANGAN pakai thumbnail menu/tema)
    let thumb = opts.thumb || opts.thumbnail || opts.jpegThumbnail
    if (!thumb) {
        thumb = (await getProfileThumbnail(sock, senderJid)) || FALLBACK_THUMBNAIL
    } else if (typeof thumb === "string") {
        if (thumb.startsWith("http://") || thumb.startsWith("https://")) {
            try {
                const res = await fetch(thumb)
                if (res.ok) thumb = Buffer.from(await res.arrayBuffer())
            } catch {}
        } else if (fs.existsSync(thumb)) {
            thumb = fs.readFileSync(thumb)
        } else {
            try { thumb = Buffer.from(thumb, "base64") } catch {}
        }
    }

    // Format body: cantumkan targetUrl di depan bila belum ada
    const body = targetUrl && !bodyText.includes(targetUrl) ? `${targetUrl}\n\n${bodyText}` : bodyText

    // JANGAN inherit thumbnailDirectPath/mediaKey dari menu theme agar WA menampilkan pp user
    const ext = {
        text: body,
        matchedText: targetUrl,
        title: targetTitle,
        description: targetDesc,
        previewType: opts.previewType ?? 0,
        contextInfo: {
            stanzaId: m.key.id,
            participant: m.key.participant || m.key.remoteJid,
            quotedMessage: m.message,
            ...(opts.contextInfo || {})
        }
    }

    // Opsional pasang favicon jika ada di tema
    if (themeExt.faviconMMSMetadata) {
        ext.faviconMMSMetadata = themeExt.faviconMMSMetadata
    }

    if (thumb && thumb.length > 0) {
        ext.jpegThumbnail = Buffer.isBuffer(thumb) ? thumb : Buffer.from(thumb)
    }

    if (opts.renderLargerThumbnail !== undefined) {
        ext.renderLargerThumbnail = Boolean(opts.renderLargerThumbnail)
    }

    if (opts.showAdAttribution !== undefined) {
        ext.contextInfo.showAdAttribution = Boolean(opts.showAdAttribution)
    }

    if (opts.quoted === false) {
        delete ext.contextInfo.quotedMessage
        delete ext.contextInfo.stanzaId
        delete ext.contextInfo.participant
    } else if (opts.quoted && typeof opts.quoted === "object") {
        ext.contextInfo.quotedMessage = opts.quoted.message || opts.quoted
        ext.contextInfo.stanzaId = opts.quoted.key?.id || m.key.id
        ext.contextInfo.participant = opts.quoted.key?.participant || opts.quoted.key?.remoteJid || m.key.participant
    }

    return await sock.relayMessage(jid, {
        extendedTextMessage: ext,
        messageContextInfo: {
            messageSecret: crypto.randomBytes(32)
        }
    }, {})
}

const arashireply = arashirep

function del () {
    /**@type {WASocket}  */
    const sock = this.sock

    /** @type {WAMessage}*/
    const m = this
    return sock.sendMessage(m.key.remoteJid, {
        delete : this.key
    })
}

// ==================== HELPER SEND MEDIA SHORTCUTS ====================

/**
 * Kirim Gambar langsung ke chat
 * @param {Buffer|string|object} image - buffer, file path, atau url
 * @param {string|object} [captionOrOptions] - teks caption atau object options
 * @param {object} [extraOpts] - options tambahan seperti quoted, mentions
 */
function sendImage(image, captionOrOptions = "", extraOpts = {}) {
    const sock = this.sock
    const targetJid = this.key?.remoteJid
    const imgPayload = toBaileysMedia(image)

    let message = { image: imgPayload }
    let options = { quoted: this, ...extraOpts }

    if (typeof captionOrOptions === "string") {
        if (captionOrOptions) message.caption = captionOrOptions
    } else if (captionOrOptions && typeof captionOrOptions === "object") {
        message = { ...message, ...captionOrOptions }
        options = { ...options, ...captionOrOptions }
    }

    return sock.sendMessage(targetJid, message, options)
}

/**
 * Kirim Video langsung ke chat
 * @param {Buffer|string|object} video
 * @param {string|object} [captionOrOptions]
 * @param {object} [extraOpts]
 */
function sendVideo(video, captionOrOptions = "", extraOpts = {}) {
    const sock = this.sock
    const targetJid = this.key?.remoteJid
    const vidPayload = toBaileysMedia(video)

    let message = { video: vidPayload }
    let options = { quoted: this, ...extraOpts }

    if (typeof captionOrOptions === "string") {
        if (captionOrOptions) message.caption = captionOrOptions
    } else if (captionOrOptions && typeof captionOrOptions === "object") {
        message = { ...message, ...captionOrOptions }
        options = { ...options, ...captionOrOptions }
    }

    return sock.sendMessage(targetJid, message, options)
}

/**
 * Kirim Voice Note (PTT) langsung ke chat
 * @param {Buffer|string|object} audio - audio buffer atau file
 * @param {object} [extraOpts]
 */
function sendVn(audio, extraOpts = {}) {
    const sock = this.sock
    const targetJid = this.key?.remoteJid
    const audPayload = toBaileysMedia(audio)

    const message = {
        audio: audPayload,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
        ...extraOpts
    }

    return sock.sendMessage(targetJid, message, { quoted: this, ...extraOpts })
}

/**
 * Kirim Audio biasa / musik langsung ke chat
 * @param {Buffer|string|object} audio
 * @param {object} [extraOpts]
 */
function sendAudio(audio, extraOpts = {}) {
    const sock = this.sock
    const targetJid = this.key?.remoteJid
    const audPayload = toBaileysMedia(audio)

    const message = {
        audio: audPayload,
        mimetype: extraOpts.mimetype || "audio/mp4",
        ptt: false,
        ...extraOpts
    }

    return sock.sendMessage(targetJid, message, { quoted: this, ...extraOpts })
}

/**
 * Kirim Dokumen / File apapun langsung ke chat
 * @param {Buffer|string|object} doc - buffer file
 * @param {string|object} [fileNameOrOpts="document"] - nama file atau options
 * @param {string} [mimetype="application/octet-stream"]
 * @param {object} [extraOpts]
 */
function sendDocu(doc, fileNameOrOpts = "document", mimetype = "application/octet-stream", extraOpts = {}) {
    const sock = this.sock
    const targetJid = this.key?.remoteJid
    const docPayload = toBaileysMedia(doc)

    let message = { document: docPayload, mimetype }
    let options = { quoted: this, ...extraOpts }

    if (typeof fileNameOrOpts === "string") {
        message.fileName = fileNameOrOpts
    } else if (fileNameOrOpts && typeof fileNameOrOpts === "object") {
        message = { ...message, ...fileNameOrOpts }
        options = { ...options, ...fileNameOrOpts }
    }

    return sock.sendMessage(targetJid, message, options)
}

/**
 * Kirim Stiker langsung ke chat
 * @param {Buffer|string|object} sticker - webp sticker buffer atau file
 * @param {object} [extraOpts]
 */
function sendSticker(sticker, extraOpts = {}) {
    const sock = this.sock
    const targetJid = this.key?.remoteJid
    const stkPayload = toBaileysMedia(sticker)

    const message = {
        sticker: stkPayload,
        ...extraOpts
    }

    return sock.sendMessage(targetJid, message, { quoted: this, ...extraOpts })
}

/**
 * Kirim Kontak WhatsApp langsung ke chat
 * @param {string} jidUser - jid atau nomor telepon kontak
 * @param {string} [displayName="User"] - nama kontak
 * @param {object} [extraOpts]
 */
function sendContact(jidUser, displayName = "User", extraOpts = {}) {
    const sock = this.sock
    const targetJid = this.key?.remoteJid
    const number = String(jidUser).replace(/[^0-9]/g, "")

    const vcard =
        "BEGIN:VCARD\n" +
        "VERSION:3.0\n" +
        `FN:${displayName}\n` +
        `ORG:Arashi Contact;\n` +
        `TEL;type=CELL;type=VOICE;waid=${number}:+${number}\n` +
        "END:VCARD"

    const message = {
        contacts: {
            displayName,
            contacts: [{ vcard }]
        },
        ...extraOpts
    }

    return sock.sendMessage(targetJid, message, { quoted: this, ...extraOpts })
}

export {
    download,
    react,
    reply,
    arashirep,
    arashireply,
    del,
    sendImage,
    sendVideo,
    sendVn,
    sendAudio,
    sendDocu,
    sendSticker,
    sendContact
}
