import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { config } from "#root/config.js"

const BULLET = "▨"
const THUMB_PATH = path.join(process.cwd(), "assets", "menu-thumbnail.jpg")
const MENU_THUMBNAIL = "/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAPACADASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAgQFAwb/xAAjEAACAgIABwADAAAAAAAAAAABAgMRAAQSISIxQVFhBXGh/8QAFgEBAQEAAAAAAAAAAAAAAAAABAID/8QAGxEBAAMAAwEAAAAAAAAAAAAAAQACERIhQUL/2gAMAwEAAhEDEQA/AObbVm1ysqyKVJ4A6+Ccein3EZWYJJwqBf2+x94DaqwaTTmRyocKUBq7zEb1aYhUEOJAzEehjzPIJGwbLupsLDHLNsRGJqpXKdPEfo7YrspNMwkedXK8hbX9oYSMIvx665lvYHWQFoWfF+/5k1iQQ+sSnIgpZr7X7y6v0Ex4Netn/9k="

function getThemeThumbnail(themeManager) {
    const themeThumb = themeManager?.getData?.()?.message?.extendedTextMessage?.jpegThumbnail
    if (themeThumb?.length) {
        return typeof themeThumb === "string" ? Buffer.from(themeThumb, "base64") : Buffer.from(themeThumb)
    }
    if (fs.existsSync(THUMB_PATH)) {
        return fs.readFileSync(THUMB_PATH)
    }
    return Buffer.from(MENU_THUMBNAIL, "base64")
}

async function sendMenu(ctx, content) {
    const { sock, jid, m, themeManager } = ctx
    const theme = themeManager?.getData?.() || {}
    const url = theme?.url || config.menuUrl

    const title = theme?.title || config.menuTitle
    const description = theme?.description

    const thumbBuf = getThemeThumbnail(themeManager)
    const ext = {
        ...theme?.message?.extendedTextMessage,
        text: `${url}\n\n${content}`,
        matchedText: url,
        description,
        title,
        renderLargerThumbnail: true,
        contextInfo: {
            stanzaId: m.key.id,
            participant: m.key.participant || m.key.remoteJid,
            quotedMessage: m.message
        }
    }
    if (!description) delete ext.description
    if (!title) delete ext.title
    if (thumbBuf && thumbBuf.length > 0 && !theme?.message?.extendedTextMessage?.thumbnailDirectPath) {
        ext.jpegThumbnail = Buffer.isBuffer(thumbBuf) ? thumbBuf : Buffer.from(thumbBuf, "base64")
    }

    return await sock.relayMessage(jid, {
        extendedTextMessage: ext,
        messageContextInfo: { messageSecret: crypto.randomBytes(32) }
    }, {})
}

const categoryBlock = (category, commands) =>
    `${BULLET}  *${category}*\n\n${commands.map(c => `- ${c}`).join("\n")}`

async function run(ctx) {
    const { m, text, prefix, menuManager } = ctx
    const p = `${prefix ?? ""}menu`

    menuManager.buildMenu()

    const { categoryArray, categoryMap } = menuManager
    const input = (text || "").trim().toLowerCase()

    if (!input) {
        const list = categoryArray.map(c => `${BULLET}  *${c}*`).join("\n")
        return await sendMenu(ctx,
            `list of menu categories\n\n${list}\n\n` +
            `> ${p} <category> untuk lihat menu tertentu\n` +
            `> ${p} all untuk lihat semuanya`
        )
    }

    if (input === "all") {
        const all = categoryArray
            .map(c => categoryBlock(c, categoryMap.get(c).textArray))
            .join("\n\n")
        return await sendMenu(ctx, all)
    }

    const entry = categoryMap.get(input)
    if (!entry) {
        return await m.arashirep(`tidak ada kategori *${text.trim()}*\n\nkategori yang ada: ${categoryArray.join(", ")}`)
    }

    return await sendMenu(ctx, `${categoryBlock(input, entry.textArray)}\n\n> ${p} untuk kembali`)
}

const plugin = {
    run,
    name: "menu",
    commands: ["menu"],
    categories: ["main"],
    description: "menampilkan daftar menu per kategori."
}

plugin.meta = {
    filename: "menu.js",
    version: "1.0.0",
    author: "Kadokun",
    note: "menu polosan",
    path: "main"
}

export default plugin
