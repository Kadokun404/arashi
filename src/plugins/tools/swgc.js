/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import crypto from "crypto"
import { spawn } from "child_process"
import { isJidGroup, generateWAMessageContent } from "baileys"

const WARNA = {
    biru: 0x1E88E5,
    hijau: 0x25D366,
    kuning: 0xFFD600,
    jingga: 0xFF9800,
    merah: 0xE53935,
    ungu: 0x8E24AA,
    abu: 0x9E9E9E,
    hitam: 0x000000,
    putih: 0xFFFFFF,
    cyan: 0x00BCD4
}

const MEDIA_RE = /^(image|video|audio|sticker)Message$/
const EMOJI_RE = /^\p{Extended_Pictographic}/u
const DEFAULT_NAME = "Arashi"
const FONTS = { sans: 0, bold: 6, script: 7, serif: 8, tebal: 9, mono: 10 }

const toArgb = c => (0xFF000000 | c) >>> 0

function toVN(buffer) {
    return new Promise((resolve, reject) => {
        const p = spawn("ffmpeg", [
            "-hide_banner", "-loglevel", "error",
            "-i", "pipe:0", "-vn", "-c:a", "libopus", "-f", "ogg", "pipe:1"
        ])
        const chunks = []
        p.stdout.on("data", c => chunks.push(c))
        p.stderr.on("data", () => {})
        p.stdin.on("error", () => {})
        p.on("error", reject)
        p.on("close", code => code === 0
            ? resolve(Buffer.concat(chunks))
            : reject(new Error(`ffmpeg gagal (code ${code})`)))
        p.stdin.end(buffer)
    })
}

const statusContext = (listName, listEmoji) => ({
    expiration: 86400,
    disappearingMode: { initiator: 0 },
    featureEligibilities: {
        cannotBeRanked: false,
        canBeReshared: true,
        canReceiveMultiReact: true
    },
    statusSourceType: 4,
    statusAttributions: [{ type: 10 }],
    isGroupStatus: true,
    statusAudienceMetadata: { audienceType: 2, listName, listEmoji }
})

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, q, sock, jid: chatJid, text, command, prefix, isOwner } = ctx
    if (!isOwner) return

    const src = [q, m].find(x => x && MEDIA_RE.test(x.content || ""))
    const hasMedia = !!src
    const args = (text || "").split(q ? /[|\s]+/ : "|").map(v => v.trim()).filter(Boolean)

    let teks = "", warna = "", emoji = "", nama = "", target = ""
    let fontId = FONTS.bold, fontSet = false

    for (const v of args) {
        if (/chat\.whatsapp\.com\//i.test(v) || /@g\.us$/.test(v) || /^\d{10,}$/.test(v)) {
            target = v
        } else if (!warna && WARNA[v.toLowerCase()] !== undefined) {
            warna = v.toLowerCase()
        } else if (!fontSet && FONTS[v.toLowerCase()] !== undefined) {
            fontId = FONTS[v.toLowerCase()]; fontSet = true
        } else if (!emoji && EMOJI_RE.test(v)) {
            emoji = v
        } else if (!teks && !hasMedia) {
            teks = v
        } else if (!nama) {
            nama = v
        }
    }

    const caption = teks || q?.text || ""
    const p = `${prefix ?? ""}${command}`

    if (!caption && !hasMedia) {
        return await m.arashirep(
            `Penggunaan:\n` +
            `${p} halo\n` +
            `${p} halo|merah\n` +
            `${p} halo|merah|😂|NamaStatus\n` +
            `${p} halo|linkgrup\n\n` +
            `Reply media (foto/video/audio/stiker):\n` +
            `${p}\n` +
            `${p} merah|😂|NamaStatus\n` +
            `${p} linkgrup`
        )
    }

    let jid = chatJid
    if (target) {
        if (/chat\.whatsapp\.com\//i.test(target)) {
            const code = target.split("chat.whatsapp.com/")[1].split(/[?\s]/)[0]
            try {
                jid = (await sock.groupGetInviteInfo(code)).id
            } catch {
                return await m.arashirep("❌ link grup tidak valid atau bot belum join")
            }
        } else {
            jid = /^\d+$/.test(target) ? `${target}@g.us` : target
        }
    }

    if (!isJidGroup(jid)) return await m.arashirep("❌ target harus grup, kirim dari grup atau sertakan link grupnya")

    const keys = Object.keys(WARNA)
    const pilih = warna || keys[Math.floor(Math.random() * keys.length)]
    const bgColor = toArgb(WARNA[pilih])
    const textColor = pilih === "putih" ? 0xFF000000 : 0xFFFFFFFF

    const contextInfo = statusContext(nama || DEFAULT_NAME, emoji || "✨")
    const opts = {
        messageId: crypto.randomBytes(16).toString("hex").toUpperCase(),
        additionalNodes: [{ tag: "meta", attrs: { is_group_status: "true" } }]
    }
    const messageContextInfo = { messageSecret: crypto.randomBytes(32) }

    await m.react("⏳")
    try {
        if (hasMedia) {
            const buffer = await src.download("buffer")
            let payload, key

            if (src.content === "imageMessage") {
                payload = { image: buffer, caption }
                key = "imageMessage"
            } else if (src.content === "videoMessage") {
                payload = { video: buffer, caption }
                key = "videoMessage"
            } else if (src.content === "audioMessage") {
                payload = { audio: await toVN(buffer), ptt: true, mimetype: "audio/ogg; codecs=opus" }
                key = "audioMessage"
            } else {
                payload = { sticker: buffer }
                key = "stickerMessage"
            }

            const content = await generateWAMessageContent(payload, { upload: sock.waUploadToServer })
            const media = content[key]
            media.contextInfo = { ...(media.contextInfo || {}), ...contextInfo }
            await sock.relayMessage(jid, { [key]: media, messageContextInfo }, opts)
        } else {
            await sock.relayMessage(jid, {
                extendedTextMessage: {
                    text: caption,
                    textArgb: textColor,
                    backgroundArgb: bgColor,
                    font: fontId,
                    contextInfo
                },
                messageContextInfo
            }, opts)
        }
        await m.react("✅")
        return await m.arashirep(`✅ status terkirim ke grup:\n${jid}`)
    } catch (e) {
        await m.react("❌")
        return await m.arashirep(`❌ gagal upload status: ${e.message || e}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "swgc",
    commands: ["swgc"],
    categories: ["tools"],
    description: "upload status grup WhatsApp (teks berwarna, foto, video, VN, stiker), bisa ke grup lain lewat link"
}

plugin.meta = {
    filename: "swgc.js",
    version: "1",
    author: "Kado",
    note: "owner only, audio dikonversi ke VN pakai ffmpeg",
    path: "tools"
}

export default plugin
