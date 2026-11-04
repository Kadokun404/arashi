/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */
/* ‎❉ Name   : IGQC
‎❉ Creator   : Ditzzx
‎❉ Category : Canvas
‎❉ Base    : -
‎❉ Code      : https://gist.ditzzzx.my.id/code/igqc.js
‎❉ Sumber  : https://whatsapp.com/channel/0029VbCHRSDAzNboLatr0W0o
‎❉ *Note* : Support emoji, ga support img. Kalo ada yang kurang sesuaikan aja sendiri.
‎*/
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas"
import { writeFile, mkdir, readFile, unlink } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { allPaths } from "#root/src/all-paths.js"
import { config } from "#root/config.js"

const FONTS = [
    {
        family: "InterRegular",
        url: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2",
        localName: "Inter-Regular.ttf"
    }
]

const BG_URL = "https://cdn.jsdelivr.net/gh/Ditzzx-vibecoder/Assets@main/Image/igqc.png"
const CANVAS_SIZE = { width: 878, height: 1791 }

const ASSETS_DIR = join(allPaths.assets ?? join(process.cwd(), "assets"), "rinchat")
const FONTS_DIR = join(ASSETS_DIR, "fonts")

const APPLE_EMOJI_JSON_URL =
    "https://media.githubusercontent.com/media/Ditzzx-vibecoder/entahlah/main/emoji-apple.json"
const APPLE_EMOJI_JSON_LOCAL = join(FONTS_DIR, "emoji-apple-image.json")

let appleEmojiMap = null
let fontsRegistered = false
const emojiImageCache = new Map()
const EMOJI_REGEX =
    /(\p{Emoji_Modifier_Base}\p{Emoji_Modifier}|\p{Emoji_Presentation}\uFE0F?|\p{Emoji}\uFE0F|[\u{1F1E0}-\u{1F1FF}]{2}|\p{Extended_Pictographic}\uFE0F?)/gu

async function download(url) {
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
    })
    if (!res.ok) throw new Error(`fetch gagal ${url}`)
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

    const bgLocal = join(ASSETS_DIR, "igqc.png")
    if (!existsSync(bgLocal)) {
        await writeFile(bgLocal, await download(BG_URL))
    }
    return bgLocal
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

async function drawAppleEmoji(ctx, emoji, x, y, size) {
    const img = await getEmojiImage(emoji)
    if (!img) {
        ctx.fillText(emoji, x, y)
        return
    }
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size)
}

function measureTextCustom(ctx, text, fontSize) {
    const parts = text.split(EMOJI_REGEX)
    let totalWidth = 0
    for (const part of parts) {
        if (!part) continue
        EMOJI_REGEX.lastIndex = 0
        if (EMOJI_REGEX.test(part)) {
            totalWidth += fontSize * 1.05
        } else {
            totalWidth += ctx.measureText(part).width
        }
        EMOJI_REGEX.lastIndex = 0
    }
    return totalWidth
}

async function drawTextWithEmojis(ctx, text, x, y, fontSize) {
    const parts = text.split(EMOJI_REGEX)
    let currentX = x
    for (const part of parts) {
        if (!part) continue
        EMOJI_REGEX.lastIndex = 0
        if (EMOJI_REGEX.test(part)) {
            const emojiSize = fontSize * 1.05
            const emojiCX = currentX + emojiSize / 2
            const emojiCY = y
            await drawAppleEmoji(ctx, part, emojiCX, emojiCY, emojiSize)
            currentX += emojiSize
        } else {
            ctx.fillText(part, currentX, y)
            currentX += ctx.measureText(part).width
        }
        EMOJI_REGEX.lastIndex = 0
    }
}

function wrapText(ctx, text, maxWidth, fontSize) {
    ctx.font = `${fontSize}px InterRegular`
    const words = text.split(" ")
    const lines = []
    let cur = ""
    for (let i = 0; i < words.length; i++) {
        const word = words[i]
        if (word.includes("\n")) {
            const parts = word.split("\n")
            for (let j = 0; j < parts.length; j++) {
                const test = cur + (cur ? " " : "") + parts[j]
                if (measureTextCustom(ctx, test, fontSize) > maxWidth && cur) {
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
        if (measureTextCustom(ctx, test, fontSize) > maxWidth && i > 0) {
            lines.push(cur)
            cur = word
        } else {
            cur = test
        }
    }
    if (cur) lines.push(cur)
    return lines
}

async function drawScene(text, menuTimeStr) {
    const bgLocal = await prepareAssets()
    await loadAppleEmojiMap()

    const canvas = createCanvas(CANVAS_SIZE.width, CANVAS_SIZE.height)
    const ctx = canvas.getContext("2d")

    const bgImg = await loadImage(bgLocal)
    ctx.drawImage(bgImg, 0, 0, CANVAS_SIZE.width, CANVAS_SIZE.height)

    const menuBoxTop = 985
    ctx.fillStyle = "#a1a4a9"
    ctx.font = "20px InterRegular"
    ctx.textAlign = "left"
    ctx.textBaseline = "top"
    ctx.fillText(menuTimeStr, 72, menuBoxTop + 35)

    const maxWidthLimit = 530
    const paddingX = 30
    const paddingY = 22
    const fixedX = 38
    const bubbleBottom = menuBoxTop - 20

    const emCardH = 104
    const minEmCardY = 60

    let chatFontSize = 30
    const minFontSize = 12

    let chatLines = []
    let lineHeight = 0
    let finalBubbleHeight = 0
    let bubbleTop = 0
    let emCardY = 0

    while (chatFontSize >= minFontSize) {
        ctx.font = `${chatFontSize}px InterRegular`
        chatLines = wrapText(ctx, text, maxWidthLimit, chatFontSize)
        lineHeight = chatFontSize + 14
        finalBubbleHeight = (chatLines.length - 1) * lineHeight + chatFontSize + paddingY * 2
        bubbleTop = bubbleBottom - finalBubbleHeight
        emCardY = bubbleTop - emCardH - 20

        if (emCardY >= minEmCardY) {
            break
        }
        chatFontSize -= 1
    }

    let longestW = 0
    chatLines.forEach(l => {
        const w = measureTextCustom(ctx, l.trim(), chatFontSize)
        if (w > longestW) longestW = w
    })

    let bubbleW = longestW + paddingX * 2
    bubbleW = Math.max(bubbleW, 180)

    const rad = 25
    ctx.fillStyle = "#262628"
    ctx.beginPath()
    ctx.moveTo(fixedX + 8, bubbleTop)
    ctx.lineTo(fixedX + bubbleW - rad, bubbleTop)
    ctx.quadraticCurveTo(fixedX + bubbleW, bubbleTop, fixedX + bubbleW, bubbleTop + rad)
    ctx.lineTo(fixedX + bubbleW, bubbleTop + finalBubbleHeight - rad)
    ctx.quadraticCurveTo(
        fixedX + bubbleW,
        bubbleTop + finalBubbleHeight,
        fixedX + bubbleW - rad,
        finalBubbleHeight + bubbleTop
    )
    ctx.lineTo(fixedX + rad, bubbleTop + finalBubbleHeight)
    ctx.quadraticCurveTo(
        fixedX,
        bubbleTop + finalBubbleHeight,
        fixedX,
        bubbleTop + finalBubbleHeight - rad
    )
    ctx.lineTo(fixedX, bubbleTop + 8)
    ctx.quadraticCurveTo(fixedX, bubbleTop, fixedX + 8, bubbleTop)
    ctx.closePath()
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(fixedX + 4, bubbleTop + 20)
    ctx.quadraticCurveTo(fixedX - 10, bubbleTop + 4, fixedX - 16, bubbleTop)
    ctx.quadraticCurveTo(fixedX - 2, bubbleTop, fixedX + 14, bubbleTop + 2)
    ctx.closePath()
    ctx.fill()

    ctx.save()
    ctx.fillStyle = "#eff0f4"
    ctx.font = `${chatFontSize}px InterRegular`
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    for (let i = 0; i < chatLines.length; i++) {
        const lineY = bubbleTop + paddingY + i * lineHeight + chatFontSize / 2
        await drawTextWithEmojis(ctx, chatLines[i].trim(), fixedX + paddingX, lineY, chatFontSize)
    }
    ctx.restore()

    const emojis = ["❤️", "😂", "😮", "😢", "😡", "👍"]
    const emojiSize = 56
    const emCardW = 600
    const emCardX = fixedX - 6

    ctx.fillStyle = "#222328"
    ctx.beginPath()
    ctx.roundRect(emCardX, emCardY, emCardW, emCardH, [emCardH / 2])
    ctx.fill()

    const startX = emCardX + 52
    const spacingX = 80
    const emojiCY = emCardY + emCardH / 2

    for (let i = 0; i < Math.min(emojis.length, 6); i++) {
        await drawAppleEmoji(ctx, emojis[i], startX + i * spacingX, emojiCY, emojiSize)
    }

    ctx.fillStyle = "#8e8e93"
    ctx.font = "42px InterRegular"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("+", startX + 6 * spacingX - 2, emCardY + emCardH / 2 - 2)

    return await canvas.encode("png")
}

/**
 * strip prefix + command name dari ctx.text, tanpa asumsi prefix truthy
 */
function extractText(ctx, extraNames = []) {
    const raw = String(ctx.text ?? ctx.m?.text ?? ctx.m?.body ?? "").trim()

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
    const now = new Date()
    const days = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"]
    const day = days[now.getDay()]
    const hh = String(now.getHours()).padStart(2, "0")
    const mm = String(now.getMinutes()).padStart(2, "0")
    return `${day} ${hh}.${mm}`
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid } = ctx

    const text = extractText(ctx, plugin.commands)

    if (!text) {
        return await m.arashirep("contoh: .igqc Big money never comes clean 💸💸")
    }

    await m.arashirep("🎨 lagi bikin gambarnya...")

    try {
        const pngBuffer = await drawScene(text, formatTimeNow())

        await sock.sendMessage(
            jid,
            {
                image: pngBuffer
            },
            { quoted: m }
        )
    } catch (err) {
        await m.arashirep(`eror jir\n${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "igqc",
    commands: ["igqc"],
    categories: ["maker"],
    description: "bikin gambar quote chat ig ala igqc"
}

plugin.meta = {
    filename: "igqc.js",
    version: "1.0.0",
    author: config.devName,
    note: "igqc image generator via napi-rs canvas",
    path: "maker"
}

export default plugin