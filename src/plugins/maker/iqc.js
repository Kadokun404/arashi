/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas"
import { writeFile, mkdir, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { jidDecode } from "baileys"
import { allPaths } from "#root/src/all-paths.js"
import { config } from "#root/config.js"

const FONTS = [
    {
        family: "InterRegular",
        url: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2",
        localName: "Inter-Regular.ttf"
    }
]

const BG_URL = "https://c.termai.cc/i130/eXj7f.png"
const BG_W = 941
const BG_H = 1671

const ASSETS_DIR = join(allPaths.assets ?? join(process.cwd(), "assets"), "rinchat")
const FONTS_DIR = join(ASSETS_DIR, "fonts")

const APPLE_EMOJI_JSON_URL = "https://media.githubusercontent.com/media/Ditzzx-vibecoder/entahlah/main/emoji-apple.json"
const APPLE_EMOJI_JSON_LOCAL = join(FONTS_DIR, "emoji-apple-image.json")

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "👏"]

let appleEmojiMap = null
let fontsRegistered = false
let bgLocalPath = null
const emojiImageCache = new Map()

const EMOJI_REGEX = /(\p{Emoji_Modifier_Base}\p{Emoji_Modifier}|\p{Emoji_Presentation}\uFE0F?|\p{Emoji}\uFE0F|[\u{1F1E0}-\u{1F1FF}]{2}|\p{Extended_Pictographic}\uFE0F?)/gu

async function download(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    })

    if (!res.ok) throw new Error(`Fetch gagal: ${url}`)

    return Buffer.from(await res.arrayBuffer())
}

async function prepareAssets() {
    await mkdir(FONTS_DIR, { recursive: true })

    if (!fontsRegistered) {
        for (const font of FONTS) {
            const fontLocal = join(FONTS_DIR, font.localName)

            if (!existsSync(fontLocal)) {
                await writeFile(fontLocal, await download(font.url))
            }

            GlobalFonts.registerFromPath(fontLocal, font.family)
        }

        fontsRegistered = true
    }

    if (!bgLocalPath) {
        const bgLocal = join(ASSETS_DIR, "iqc-bg.png")

        if (!existsSync(bgLocal)) {
            await writeFile(bgLocal, await download(BG_URL))
        }

        bgLocalPath = bgLocal
    }

    return bgLocalPath
}

function emojiToUnicode(emoji) {
    return [...emoji].map(c => c.codePointAt(0).toString(16).padStart(4, "0")).join("-")
}

async function loadAppleEmojiMap() {
    if (appleEmojiMap) return appleEmojiMap

    if (!existsSync(APPLE_EMOJI_JSON_LOCAL)) {
        const buf = await download(APPLE_EMOJI_JSON_URL)
        await writeFile(APPLE_EMOJI_JSON_LOCAL, buf)
    }

    const raw = await readFile(APPLE_EMOJI_JSON_LOCAL, "utf-8")
    appleEmojiMap = JSON.parse(raw)

    return appleEmojiMap
}

async function getEmojiImage(emoji) {
    if (emojiImageCache.has(emoji)) return emojiImageCache.get(emoji)

    const map = await loadAppleEmojiMap()
    const base = emojiToUnicode(emoji)

    const variants = [
        base,
        base.replace(/-fe0f/gi, ""),
        `${base.replace(/-fe0f/gi, "")}-fe0f`,
        base.toUpperCase(),
        base.replace(/-fe0f/gi, "").toUpperCase(),
        base.replace(/-fe0f/gi, "").toUpperCase() + "-FE0F"
    ]

    let b64 = null

    for (const v of variants) {
        if (map[v]) {
            b64 = map[v]
            break
        }
    }

    if (!b64) return null

    const buf = Buffer.from(b64, "base64")
    const img = await loadImage(buf)

    emojiImageCache.set(emoji, img)

    return img
}

async function drawAppleEmoji(ctx2d, emoji, x, y, size) {
    const img = await getEmojiImage(emoji)

    if (!img) {
        ctx2d.fillText(emoji, x, y)
        return
    }

    ctx2d.drawImage(img, x - size / 2, y - size / 2, size, size)
}

function measureTextCustom(ctx2d, text, fontSize) {
    const parts = text.split(EMOJI_REGEX)
    let totalWidth = 0

    for (const part of parts) {
        if (!part) continue

        EMOJI_REGEX.lastIndex = 0

        if (EMOJI_REGEX.test(part)) {
            totalWidth += fontSize * 1.05
        } else {
            totalWidth += ctx2d.measureText(part).width
        }

        EMOJI_REGEX.lastIndex = 0
    }

    return totalWidth
}

async function drawTextWithEmojis(ctx2d, text, x, y, fontSize) {
    const parts = text.split(EMOJI_REGEX)
    let currentX = x

    for (const part of parts) {
        if (!part) continue

        EMOJI_REGEX.lastIndex = 0

        if (EMOJI_REGEX.test(part)) {
            const emojiSize = fontSize * 1.05
            const emojiCX = currentX + emojiSize / 2
            const emojiCY = y

            await drawAppleEmoji(ctx2d, part, emojiCX, emojiCY, emojiSize)
            currentX += emojiSize
        } else {
            ctx2d.fillText(part, currentX, y)
            currentX += ctx2d.measureText(part).width
        }

        EMOJI_REGEX.lastIndex = 0
    }
}

function wrapText(ctx2d, text, maxWidth, fontSize) {
    ctx2d.font = `${fontSize}px InterRegular`

    const words = text.split(" ")
    const lines = []
    let cur = ""

    for (let i = 0; i < words.length; i++) {
        const word = words[i]

        if (word.includes("\n")) {
            const parts = word.split("\n")

            for (let j = 0; j < parts.length; j++) {
                const test = cur + (cur ? " " : "") + parts[j]

                if (measureTextCustom(ctx2d, test, fontSize) > maxWidth && cur) {
                    lines.push(cur)
                    cur = parts[j]
                } else {
                    cur = test
                }

                if (j < parts.length - 1) {
                    lines.push(cur)
                    cur = ""
                }
            }

            continue
        }

        const test = cur + (cur ? " " : "") + word

        if (measureTextCustom(ctx2d, test, fontSize) > maxWidth && i > 0) {
            lines.push(cur)
            cur = word
        } else {
            cur = test
        }
    }

    if (cur) lines.push(cur)

    return lines
}

function extractText(ctx, extraNames = []) {
    const raw = String(ctx.text ?? ctx.m?.text ?? "").trim()

    const prefix = ctx.prefix ?? ""
    const command = ctx.command ?? ""

    const names = [...new Set([command, ...extraNames].filter(Boolean))]
    if (!names.length) return raw

    const prefixEscaped = prefix ? prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : ""
    const namesEscaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")

    const pattern = new RegExp(`^\\s*${prefixEscaped}(${namesEscaped})\\b\\s*`, "i")

    return raw.replace(pattern, "").trim()
}

function formatTimeNow() {
    return Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta"
    }).format(Date.now()).replace(":", ".")
}

const resolveJid = (jid, contactStore) => {
    if (!jid) return ""

    if (jid.includes("@lid") && contactStore) {
        const contact = contactStore.getByLid(jid) || contactStore.upsertAndGet({ lid: jid })
        return contact?.pn || jid
    }

    return jid
}

const parseMentions = (text, mentionedJids, contactStore) => {
    let parsedText = text || ""

    if (mentionedJids && mentionedJids.length > 0) {
        mentionedJids.forEach(lid => {
            if (contactStore) {
                const c = contactStore.upsertAndGet({ lid })
                const mention = "@" + jidDecode(c.lid)?.user
                const name = c?.name || c?.pushName || "anonim"

                parsedText = parsedText.replaceAll(mention, "[@" + name + "]")
            }
        })
    }

    return parsedText
}

async function drawScene({ text, imgBuffer, caption, timeStr, quotedMsg, ppBuffer, senderName, isGroup }) {
    const bgLocal = await prepareAssets()
    await loadAppleEmojiMap()

    const canvas = createCanvas(BG_W, BG_H)
    const ctx2d = canvas.getContext("2d")

    const bgImg = await loadImage(bgLocal)
    ctx2d.drawImage(bgImg, 0, 0, BG_W, BG_H)

    let ppImage = null
    if (ppBuffer && isGroup) {
        ppImage = await loadImage(ppBuffer).catch(() => null)
    }

    const chatFontSize = 24
    const maxWidthLimit = 530
    const minBubbleWidth = 150
    const lineHeight = chatFontSize + 10
    const paddingX = 20
    const paddingY = 16
    const rad = 24

    const fixedX = isGroup ? 75 : 35
    const fixedBaseY = 946

    ctx2d.font = "18px InterRegular"
    const timeWidth = ctx2d.measureText(timeStr).width

    let finalY, finalBubbleHeight, bubbleW

    const quoteH = 46
    const quoteMarginTop = 10
    const quoteMarginBottom = 10
    const extraQuoteHeight = quotedMsg ? (quoteMarginTop + quoteH + quoteMarginBottom) : 0

    let qThumb = null
    if (quotedMsg?.imageBuffer) {
        qThumb = await loadImage(quotedMsg.imageBuffer).catch(() => null)
    }

    const drawBubbleShape = (bw, top, height) => {
        ctx2d.fillStyle = "#1c1c1e"
        ctx2d.beginPath()
        ctx2d.moveTo(fixedX + rad, top)
        ctx2d.lineTo(fixedX + bw - rad, top)
        ctx2d.quadraticCurveTo(fixedX + bw, top, fixedX + bw, top + rad)
        ctx2d.lineTo(fixedX + bw, top + height - rad)
        ctx2d.quadraticCurveTo(fixedX + bw, top + height, fixedX + bw - rad, top + height)
        ctx2d.lineTo(fixedX + rad, top + height)
        ctx2d.quadraticCurveTo(fixedX + 8, top + height, fixedX + 8, top + height - 8)
        ctx2d.lineTo(fixedX + 8, top + rad)
        ctx2d.quadraticCurveTo(fixedX + 8, top, fixedX + rad, top)
        ctx2d.closePath()
        ctx2d.fill()

        ctx2d.beginPath()
        ctx2d.moveTo(fixedX + 12, top + height - 16)
        ctx2d.quadraticCurveTo(fixedX - 2, top + height - 4, fixedX - 8, top + height)
        ctx2d.quadraticCurveTo(fixedX + 6, top + height, fixedX + 22, top + height - 2)
        ctx2d.closePath()
        ctx2d.fill()
    }

    const drawQuotedBox = (bw, yBase) => {
        if (!quotedMsg) return

        const qx = fixedX + 12
        const qy = yBase + quoteMarginTop
        const qw = bw - 24
        const qh = quoteH

        ctx2d.save()
        ctx2d.fillStyle = "#2c2c2e"
        ctx2d.beginPath()
        ctx2d.roundRect(qx, qy, qw, qh, 8)
        ctx2d.fill()

        ctx2d.fillStyle = "#0a84ff"
        ctx2d.beginPath()
        ctx2d.roundRect(qx, qy, 4, qh, [8, 0, 0, 8])
        ctx2d.fill()

        let textMaxWidth = qw - 20

        if (qThumb) {
            const thumbSize = 36

            ctx2d.save()
            ctx2d.beginPath()
            ctx2d.roundRect(qx + qw - thumbSize - 5, qy + 5, thumbSize, thumbSize, 4)
            ctx2d.clip()
            ctx2d.drawImage(qThumb, qx + qw - thumbSize - 5, qy + 5, thumbSize, thumbSize)
            ctx2d.restore()

            textMaxWidth -= (thumbSize + 10)
        }

        ctx2d.fillStyle = "#ffffff"
        ctx2d.font = "16px InterRegular"
        ctx2d.fillText(quotedMsg.name, qx + 12, qy + 18)

        ctx2d.fillStyle = "#a1a1a6"
        ctx2d.font = "14px InterRegular"

        let txt = quotedMsg.text.replace(/\n/g, " ")

        if (ctx2d.measureText(txt).width > textMaxWidth) {
            while (txt.length > 0 && ctx2d.measureText(txt + "...").width > textMaxWidth) {
                txt = txt.slice(0, -1)
            }
            txt += "..."
        }

        ctx2d.fillText(txt, qx + 12, qy + 38)
        ctx2d.restore()
    }

    if (!imgBuffer) {
        ctx2d.font = `${chatFontSize}px InterRegular`

        const chatLines = wrapText(ctx2d, text, maxWidthLimit, chatFontSize)

        let longestW = 0
        chatLines.forEach(l => {
            const w = measureTextCustom(ctx2d, l.trim(), chatFontSize)
            if (w > longestW) longestW = w
        })

        let quoteReqW = 0
        if (quotedMsg) {
            ctx2d.font = "16px InterRegular"
            quoteReqW = ctx2d.measureText(quotedMsg.name).width + (qThumb ? 80 : 40)
        }

        bubbleW = longestW + paddingX * 2
        bubbleW = Math.max(bubbleW, timeWidth + 60, minBubbleWidth, quoteReqW)

        const spaceTimeY = 12
        finalBubbleHeight = chatLines.length * lineHeight + paddingY + spaceTimeY + 18 + extraQuoteHeight
        finalY = fixedBaseY - finalBubbleHeight

        drawBubbleShape(bubbleW, finalY, finalBubbleHeight)
        drawQuotedBox(bubbleW, finalY)

        ctx2d.save()
        ctx2d.fillStyle = "#ffffff"
        ctx2d.font = `${chatFontSize}px InterRegular`
        ctx2d.textAlign = "left"
        ctx2d.textBaseline = "middle"

        for (let i = 0; i < chatLines.length; i++) {
            const lineY = finalY + paddingY + extraQuoteHeight + i * lineHeight + chatFontSize / 2
            await drawTextWithEmojis(ctx2d, chatLines[i].trim(), fixedX + paddingX, lineY, chatFontSize)
        }

        ctx2d.restore()

        ctx2d.fillStyle = "#727278"
        ctx2d.font = "18px InterRegular"
        ctx2d.textAlign = "right"
        ctx2d.textBaseline = "top"
        ctx2d.fillText(timeStr, fixedX + bubbleW - 20, finalY + finalBubbleHeight - 32)
    } else {
        const imgObj = await loadImage(imgBuffer)
        const imgAspect = imgObj.width / imgObj.height

        bubbleW = Math.min(Math.max(imgObj.width, minBubbleWidth), maxWidthLimit)

        let quoteReqW = 0
        if (quotedMsg) {
            ctx2d.font = "16px InterRegular"
            quoteReqW = ctx2d.measureText(quotedMsg.name).width + (qThumb ? 80 : 40)
        }

        bubbleW = Math.max(bubbleW, timeWidth + 60, quoteReqW)

        let imgDrawH = Math.round(bubbleW / imgAspect)

        let captionLines = []
        if (caption) {
            ctx2d.font = `${chatFontSize}px InterRegular`
            captionLines = wrapText(ctx2d, caption, bubbleW - paddingX * 2, chatFontSize)
        }

        const captionH = captionLines.length > 0 ? paddingY + captionLines.length * lineHeight : 0
        const timeRowH = 28

        finalBubbleHeight = imgDrawH + captionH + timeRowH + (captionLines.length > 0 ? 4 : 0) + extraQuoteHeight
        finalY = fixedBaseY - finalBubbleHeight

        const imgDrawY = finalY + extraQuoteHeight

        drawBubbleShape(bubbleW, finalY, finalBubbleHeight)
        drawQuotedBox(bubbleW, finalY)

        ctx2d.save()
        ctx2d.beginPath()

        if (quotedMsg) {
            ctx2d.moveTo(fixedX + 8, imgDrawY)
            ctx2d.lineTo(fixedX + bubbleW, imgDrawY)
        } else {
            ctx2d.moveTo(fixedX + rad, imgDrawY)
            ctx2d.lineTo(fixedX + bubbleW - rad, imgDrawY)
            ctx2d.quadraticCurveTo(fixedX + bubbleW, imgDrawY, fixedX + bubbleW, imgDrawY + rad)
        }

        ctx2d.lineTo(fixedX + bubbleW, imgDrawY + imgDrawH)
        ctx2d.lineTo(fixedX + 8, imgDrawY + imgDrawH)

        if (quotedMsg) {
            ctx2d.lineTo(fixedX + 8, imgDrawY)
        } else {
            ctx2d.lineTo(fixedX + 8, imgDrawY + rad)
            ctx2d.quadraticCurveTo(fixedX + 8, imgDrawY, fixedX + rad, imgDrawY)
        }

        ctx2d.closePath()
        ctx2d.clip()
        ctx2d.drawImage(imgObj, fixedX, imgDrawY, bubbleW, imgDrawH)
        ctx2d.restore()

        if (captionLines.length > 0) {
            ctx2d.save()
            ctx2d.fillStyle = "#ffffff"
            ctx2d.font = `${chatFontSize}px InterRegular`
            ctx2d.textAlign = "left"
            ctx2d.textBaseline = "middle"

            for (let i = 0; i < captionLines.length; i++) {
                const lineY = imgDrawY + imgDrawH + paddingY + i * lineHeight + chatFontSize / 2
                await drawTextWithEmojis(ctx2d, captionLines[i].trim(), fixedX + paddingX, lineY, chatFontSize)
            }

            ctx2d.restore()
        }

        ctx2d.fillStyle = "#727278"
        ctx2d.font = "18px InterRegular"
        ctx2d.textAlign = "right"
        ctx2d.textBaseline = "middle"
        ctx2d.fillText(timeStr, fixedX + bubbleW - 20, finalY + finalBubbleHeight - timeRowH + 6)
    }

    if (isGroup) {
        if (senderName) {
            ctx2d.fillStyle = "#8e8e93"
            ctx2d.font = "15px InterRegular"
            ctx2d.textAlign = "left"
            ctx2d.textBaseline = "bottom"
            ctx2d.fillText(senderName, fixedX + 16, finalY - 6)
        }

        if (ppImage) {
            const ppSize = 36
            const ppX = fixedX - ppSize - 12
            const ppY = finalY + finalBubbleHeight - ppSize

            ctx2d.save()
            ctx2d.beginPath()
            ctx2d.arc(ppX + ppSize / 2, ppY + ppSize / 2, ppSize / 2, 0, Math.PI * 2)
            ctx2d.clip()
            ctx2d.drawImage(ppImage, ppX, ppY, ppSize, ppSize)
            ctx2d.restore()
        }
    }

   
    const emojiSize = Math.round(54 * 1.03)
    const emCardH = emojiSize + Math.round(44 * 1.03)
    const startPad = 55
    const spacingX = 76
    const emCardW = Math.round(startPad * 2 + spacingX * REACTION_EMOJIS.length)
    const emCardX = fixedX + 8
    const emCardY = isGroup && senderName ? finalY - emCardH - 32 : finalY - emCardH - 18

    ctx2d.fillStyle = "#1c1c1e"
    ctx2d.beginPath()
    ctx2d.roundRect(emCardX, emCardY, emCardW, emCardH, [emCardH / 2])
    ctx2d.fill()

    const startX = emCardX + startPad
    const emojiCY = emCardY + emCardH / 2 + 2

    for (let i = 0; i < REACTION_EMOJIS.length; i++) {
        await drawAppleEmoji(ctx2d, REACTION_EMOJIS[i], startX + i * spacingX, emojiCY, emojiSize)
    }

    ctx2d.fillStyle = "#8e8e93"
    ctx2d.font = `${Math.round(36 * 1.03)}px InterRegular`
    ctx2d.textAlign = "center"
    ctx2d.textBaseline = "middle"
    ctx2d.fillText("+", startX + REACTION_EMOJIS.length * spacingX - 8, emCardY + emCardH / 2 - 2)

    return await canvas.encode("png")
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, contactStore } = ctx

    let rawText = extractText(ctx, plugin.commands)
    let isGroup = false

    if (/(^|\s)-pp(\s|$)/.test(rawText)) {
        isGroup = true
        rawText = rawText.replace(/(^|\s)-pp(\s|$)/g, " ").trim()
    }

    const mentionedJids = m.message?.[m.content]?.contextInfo?.mentionedJid || []
    let textStr = parseMentions(rawText, mentionedJids, contactStore)

    let mainImgBuffer = null
    if (m.content && typeof m.download === "function") {
        mainImgBuffer = await m.download("buffer").catch(() => null)
    }

    let quotedPayload = null
    let targetJid = m.sender || m.key?.participant || jid
    let mainName = m.name || m.contact?.name || "User"

    if (q) {
        const rawQqJid = q.sender || q.participant || q.key?.participant || ""
        const qqNameResolved = q.name || "anonim"

        let qqText = q.text || ""
        const qqMentions = q.message?.[q.content]?.contextInfo?.mentionedJid || q.fullMessage?.message?.[q.content]?.contextInfo?.mentionedJid || []
        qqText = parseMentions(qqText, qqMentions, contactStore)

        let qqImageBuffer = null
        if (q.content && typeof q.download === "function") {
            qqImageBuffer = await q.download("buffer").catch(() => null)
        }

        if (qqImageBuffer && !qqText) {
            qqText = "📷 Photo/Sticker"
        }

        
        if (!mainImgBuffer && !textStr) {
            mainImgBuffer = qqImageBuffer
            textStr = qqText
            targetJid = rawQqJid || targetJid
            mainName = qqNameResolved
        } else {
            quotedPayload = {
                name: "~ " + qqNameResolved,
                text: qqText || "media",
                imageBuffer: qqImageBuffer
            }
        }
    }

    if (!textStr && !mainImgBuffer) {
        return await m.arashirep(
           
            `*CARA PAKAI:*\n` +
            `- *.iqc <teks>* → bikin bubble chat dari teks\n` +
            `- reply gambar/sticker lalu *.iqc* → bikin bubble chat dari gambar\n` +
            `- reply pesan lain lalu *.iqc <teks>* → bikin bubble chat + kutipan (quoted)\n` +
            `- tambahin *-pp* di teks → tampil sebagai chat grup (nama + foto profil)\n\n` +
            `*CONTOH:*\n` +
            `.iqc halo semuanya\n` +
            `.iqc halo semuanya -pp`
        )
    }

    let ppBuffer = null
    if (isGroup && targetJid) {
        try {
            const ppJid = resolveJid(targetJid, contactStore) || targetJid
            const ppUrl = await sock.profilePictureUrl(ppJid, "image")
            if (ppUrl) {
                const res = await fetch(ppUrl)
                if (res.ok) ppBuffer = Buffer.from(await res.arrayBuffer())
            }
        } catch (_) {}
    }

    const timeStr = formatTimeNow()

    try {
        const buffer = await drawScene({
            text: textStr,
            imgBuffer: mainImgBuffer,
            caption: mainImgBuffer ? textStr : "",
            timeStr,
            quotedMsg: quotedPayload,
            ppBuffer,
            senderName: mainName,
            isGroup
        })

        return await sock.sendMessage(jid, { image: buffer }, { quoted: m })
    } catch (err) {
        return await m.arashirep(`❌ gagal bikin gambar\n${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "iqc",
    commands: ["iqc"],
    categories: ["maker"],
    description: "bikin fake chat bubble ala iOS (teks, gambar, atau quoted reply)"
}

plugin.meta = {
    filename: "iqc.js",
    version: "1.0.0",
    author: config.devName,
    note: "fake quote iOS chat bubble maker",
    path: "maker"
}

export default plugin
