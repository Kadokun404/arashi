import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas"
import { writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { allPaths } from "#root/src/all-paths.js"

/**
 * generator kartu welcome/goodbye pake @napi-rs/canvas (udah jadi dependency
 * catesya, dipake juga sama plugins/maker/iqc.js & igqc.js).
 *
 * pola download+register font & background sengaja disamain kaya iqc.js
 * (download sekali, cache lokal di assets/, register sekali per proses)
 * biar konsisten sama plugin canvas yang udah ada.
 */

const CARD_W = 1024
const CARD_H = 500
const AVATAR_SIZE = 180

const FONTS = [
    {
        family: "Inter",
        url: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2",
        localName: "Inter-Regular.ttf"
    }
]

const ASSETS_DIR = join(allPaths.assets ?? join(process.cwd(), "assets"), "group-events")
const FONTS_DIR = join(ASSETS_DIR, "fonts")

let fontsRegistered = false

async function download(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    })
    if (!res.ok) throw new Error(`fetch gagal: ${url}`)
    return Buffer.from(await res.arrayBuffer())
}

async function prepareFonts() {
    if (fontsRegistered) return
    await mkdir(FONTS_DIR, { recursive: true })

    for (const font of FONTS) {
        const fontLocal = join(FONTS_DIR, font.localName)
        if (!existsSync(fontLocal)) {
            await writeFile(fontLocal, await download(font.url))
        }
        GlobalFonts.registerFromPath(fontLocal, font.family)
    }
    fontsRegistered = true
}

/**
 * @param {import("@napi-rs/canvas").SKRSContext2D} ctx2d
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} fontSize
 * @param {string} fontFamily
 * @returns {string} teks yang udah di potong + "..." kalau kepanjangan
 */
function truncateText(ctx2d, text, maxWidth, fontSize, fontFamily) {
    ctx2d.font = `${fontSize}px ${fontFamily}`
    if (ctx2d.measureText(text).width <= maxWidth) return text
    let truncated = text
    while (truncated.length > 0 && ctx2d.measureText(truncated + "...").width > maxWidth) {
        truncated = truncated.slice(0, -1)
    }
    return truncated + "..."
}

/**
 * @param {import("@napi-rs/canvas").SKRSContext2D} ctx2d
 * @param {Buffer|undefined} backgroundBuffer
 */
async function drawBackground(ctx2d, backgroundBuffer) {
    if (backgroundBuffer) {
        try {
            const bg = await loadImage(backgroundBuffer)
            // cover-fit biar gak gepeng
            const scale = Math.max(CARD_W / bg.width, CARD_H / bg.height)
            const drawW = bg.width * scale
            const drawH = bg.height * scale
            ctx2d.drawImage(bg, (CARD_W - drawW) / 2, (CARD_H - drawH) / 2, drawW, drawH)
        } catch (e) {
            console.warn(`[group-events canvas] gagal load background, pakai gradient default`, e.message)
            backgroundBuffer = undefined
        }
    }

    if (!backgroundBuffer) {
        const gradient = ctx2d.createLinearGradient(0, 0, CARD_W, CARD_H)
        gradient.addColorStop(0, "#2b1055")
        gradient.addColorStop(1, "#7597de")
        ctx2d.fillStyle = gradient
        ctx2d.fillRect(0, 0, CARD_W, CARD_H)
    }

    // overlay gelap tipis biar teks tetep kebaca di atas background apapun
    ctx2d.fillStyle = "rgba(0, 0, 0, 0.45)"
    ctx2d.fillRect(0, 0, CARD_W, CARD_H)
}

/**
 * @param {import("@napi-rs/canvas").SKRSContext2D} ctx2d
 * @param {Buffer|undefined} avatarBuffer
 * @param {number} centerX
 * @param {number} centerY
 */
async function drawAvatar(ctx2d, avatarBuffer, centerX, centerY) {
    const radius = AVATAR_SIZE / 2

    ctx2d.save()
    ctx2d.beginPath()
    ctx2d.arc(centerX, centerY, radius + 6, 0, Math.PI * 2)
    ctx2d.fillStyle = "#ffffff"
    ctx2d.fill()
    ctx2d.restore()

    ctx2d.save()
    ctx2d.beginPath()
    ctx2d.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx2d.clip()

    if (avatarBuffer) {
        try {
            const avatar = await loadImage(avatarBuffer)
            ctx2d.drawImage(avatar, centerX - radius, centerY - radius, AVATAR_SIZE, AVATAR_SIZE)
        } catch (e) {
            ctx2d.fillStyle = "#555555"
            ctx2d.fillRect(centerX - radius, centerY - radius, AVATAR_SIZE, AVATAR_SIZE)
        }
    } else {
        ctx2d.fillStyle = "#555555"
        ctx2d.fillRect(centerX - radius, centerY - radius, AVATAR_SIZE, AVATAR_SIZE)
    }

    ctx2d.restore()
}

/**
 * @typedef {object} CardData
 * @property {string} name nama member (join/left)
 * @property {string} groupName nama grup
 * @property {number} memberCount jumlah member grup sekarang
 * @property {Buffer|undefined} avatarBuffer buffer foto profil member (opsional)
 * @property {Buffer|undefined} backgroundBuffer buffer background custom (opsional, download dulu dari url di caller)
 */

/**
 * @param {CardData} data
 * @returns {Promise<Buffer>} png buffer
 */
async function generateWelcomeCard(data) {
    await prepareFonts()

    const canvas = createCanvas(CARD_W, CARD_H)
    const ctx2d = canvas.getContext("2d")

    await drawBackground(ctx2d, data.backgroundBuffer)
    await drawAvatar(ctx2d, data.avatarBuffer, CARD_W / 2, 160)

    ctx2d.textAlign = "center"
    ctx2d.textBaseline = "middle"

    ctx2d.fillStyle = "#ffffff"
    ctx2d.font = "bold 54px Inter"
    ctx2d.fillText("SELAMAT DATANG", CARD_W / 2, 320)

    ctx2d.font = "36px Inter"
    const nameText = truncateText(ctx2d, data.name, CARD_W - 120, 36, "Inter")
    ctx2d.fillText(nameText, CARD_W / 2, 375)

    ctx2d.fillStyle = "#d8d8ff"
    ctx2d.font = "26px Inter"
    const subtitle = `member ke-${data.memberCount} di ${data.groupName}`
    const subtitleText = truncateText(ctx2d, subtitle, CARD_W - 120, 26, "Inter")
    ctx2d.fillText(subtitleText, CARD_W / 2, 420)

    return await canvas.encode("png")
}

/**
 * @param {CardData} data
 * @returns {Promise<Buffer>} png buffer
 */
async function generateGoodbyeCard(data) {
    await prepareFonts()

    const canvas = createCanvas(CARD_W, CARD_H)
    const ctx2d = canvas.getContext("2d")

    await drawBackground(ctx2d, data.backgroundBuffer)
    await drawAvatar(ctx2d, data.avatarBuffer, CARD_W / 2, 160)

    ctx2d.textAlign = "center"
    ctx2d.textBaseline = "middle"

    ctx2d.fillStyle = "#ffffff"
    ctx2d.font = "bold 54px Inter"
    ctx2d.fillText("SELAMAT TINGGAL", CARD_W / 2, 320)

    ctx2d.font = "36px Inter"
    const nameText = truncateText(ctx2d, data.name, CARD_W - 120, 36, "Inter")
    ctx2d.fillText(nameText, CARD_W / 2, 375)

    ctx2d.fillStyle = "#d8d8ff"
    ctx2d.font = "26px Inter"
    const subtitle = `sisa ${data.memberCount} member di ${data.groupName}`
    const subtitleText = truncateText(ctx2d, subtitle, CARD_W - 120, 26, "Inter")
    ctx2d.fillText(subtitleText, CARD_W / 2, 420)

    return await canvas.encode("png")
}

export { generateWelcomeCard, generateGoodbyeCard }
