/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { config } from "#root/config.js"

const BULLET = "▨"
const THUMB_PATH = path.join(process.cwd(), "assets", "menu-thumbnail.jpg")
const MENU_THUMBNAIL = "/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAPACADASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAgQFAwb/xAAjEAACAgIABwADAAAAAAAAAAABAgMRAAQSISIxQVFhBXGh/8QAFgEBAQEAAAAAAAAAAAAAAAAABAID/8QAGxEBAAMAAwEAAAAAAAAAAAAAAQACERIhQUL/2gAMAwEAAhEDEQA/AObbVm1ysqyKVJ4A6+Ccein3EZWYJJwqBf2+x94DaqwaTTmRyocKUBq7zEb1aYhUEOJAzEehjzPIJGwbLupsLDHLNsRGJqpXKdPEfo7YrspNMwkedXK8hbX9oYSMIvx665lvYHWQFoWfF+/5k1iQQ+sSnIgpZr7X7y6v0Ex4Netn/9k="

const CATEGORY_META = {
    main: { emoji: "🏠", label: "Menu Utama" },
    owner: { emoji: "👑", label: "Owner" },
    system: { emoji: "⚙️", label: "System" },
    tools: { emoji: "🧰", label: "Tools" },
    downloader: { emoji: "📥", label: "Downloader" },
    search: { emoji: "🔍", label: "Search" },
    ai: { emoji: "🤖", label: "Artificial Intelligence" },
    maker: { emoji: "🎨", label: "Maker & Stiker" },
    group: { emoji: "👥", label: "Group Management" },
    fun: { emoji: "🎲", label: "Fun" },
    game: { emoji: "🎮", label: "Game" },
    random: { emoji: "🍀", label: "Random / Cecan" },
    info: { emoji: "ℹ️", label: "Information" },
    stalker: { emoji: "🕵️", label: "Stalker" },
    example: { emoji: "📦", label: "Example" }
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24))
    const h = Math.floor((seconds % (3600 * 24)) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    const parts = []
    if (d > 0) parts.push(`${d}d`)
    if (h > 0) parts.push(`${h}h`)
    if (m > 0) parts.push(`${m}m`)
    parts.push(`${s}s`)
    return parts.join(" ")
}

/**
 * kirim teks menu pakai tema dari themeManager (title, desc, url, thumbnail, favicon),
 * sama persis kayak "theme view", jadi semua yang di set lewat "theme set ..." ikut kepake
 * @param {PluginCtx} ctx
 * @param {string} content
 */
async function sendMenu(ctx, content) {
    const { sock, jid, m, themeManager } = ctx
    const theme = themeManager.getData()
    const url = theme?.url || config.menuUrl

    return await sock.relayMessage(jid, {
        extendedTextMessage: {
            ...theme?.message?.extendedTextMessage,
            text: `${url}\n\n${content}`,
            matchedText: url,
            description: theme?.description,
            title: theme?.title,
            contextInfo: {
                stanzaId: m.key.id,
                participant: m.key.participant || m.key.remoteJid,
                quotedMessage: m.message
            }
        },
        messageContextInfo: { messageSecret: crypto.randomBytes(32) }
    }, {})
}

/**
 * Kirim menu interaktif berbasis Button Native Flow dengan Header Location + Thumbnail
 * @param {PluginCtx} ctx
 */
async function sendButtonMenu(ctx) {
    const { sock, jid, m, prefix, menuManager, pluginManager, prefixManager } = ctx
    const p = prefix ?? ""

    // Pastikan menu selalu up-to-date
    menuManager.buildMenu()

    const { categoryArray, categoryMap } = menuManager
    const totalCommands = pluginManager?.pluginMap?.size || 0
    const totalPlugins = pluginManager?.pluginArray?.length || 0

    const userName = m.pushName || (ctx.isOwner ? "Kado" : "User")
    const userRole = ctx.isOwner ? "Owner" : (ctx.isAdmin ? "Admin" : "User")

    const pStatus = prefixManager?.getStatus?.()
    const prefixDisplay = pStatus?.isPrefixActive ? `[ ${pStatus.prefixList.join(" , ")} ]` : "Multi / No Prefix"

    const uptime = formatUptime(process.uptime())

    const thumb = fs.existsSync(THUMB_PATH) ? fs.readFileSync(THUMB_PATH) : Buffer.alloc(0)

    const contentText =
`⢀             ⣠⣶⣶⣆
⣠⣤⣤⣤⣴⣿⣿⣯⣵⢟   ₊˚⋆｡𖦹˚₊
⢸⣟⣉⣉⣽⡿⠉⠛⠿⠿⠿⠃
⠉⠉⣡⣾⠇ ₊˚｡⋆ʚ♡ɞ ʜᴇʟʟᴏ *${userName}* ♡

*╭──〔 ୨୧ ᴜꜱᴇʀ ୨୧ 〕*
*┆* ɴᴀᴍᴀ   : *${userName}*
*┆* ʀᴏʟᴇ   : *${userRole}*
*┆* ꜱᴛᴀᴛᴜꜱ : *🟢 Online*
*╰──⊹₊˚𓂃*

*╭──〔 ୨୧ ʙᴏᴛ ɪɴꜰᴏ ୨୧ 〕*
*┆* ʙᴏᴛ      : *${config.botName || "Arashi (Ara)"}*
*┆* ᴍᴏᴅᴇ     : *Public*
*┆* ᴘʀᴇꜰɪx   : *${prefixDisplay}*
*┆* ᴜᴘᴛɪᴍᴇ   : *${uptime}*
*┆* ꜰɪᴛᴜʀ    : *${totalCommands} Command (${totalPlugins} Plugin)*
*┆* ᴋᴀᴛᴇɢᴏʀɪ : *${categoryArray.length} Kategori*
*╰──⊹₊˚𓂃*

╰╼ ┈─ ⌗ 𓂃 ᴛᴀᴋᴇ ᴀ ꜱɪᴘ, ᴅᴀʀʟɪɴɢ…
⇢ ᴛᴀᴘ ᴛᴏᴍʙᴏʟ ᴅɪ ʙᴀᴡᴀʜ`

    const categoryRows = categoryArray.map(cat => {
        const entry = categoryMap.get(cat)
        const count = entry?.commandArray?.length || entry?.textArray?.length || 0
        const meta = CATEGORY_META[cat] || { emoji: "📁", label: cat.toUpperCase() }
        return {
            title: `${meta.emoji} ${meta.label}`,
            description: `${count} command`,
            id: `${p}menu ${cat}`
        }
    })

    const sections = [
        {
            title: `ᴛᴏᴛᴀʟ ${categoryArray.length} ᴋᴀᴛᴇɢᴏʀɪ`,
            rows: categoryRows
        },
        {
            title: "⚡ ʟᴀɪɴɴʏᴀ",
            rows: [
                {
                    title: "📜 Semua Menu (All)",
                    description: `Tampilkan seluruh ${totalCommands} command`,
                    id: `${p}menu all`
                },
                {
                    title: "⚡ Ara Status & Quota",
                    description: "Cek sisa kuota Antigravity & status Ara",
                    id: `${p}ara status`
                }
            ]
        }
    ]

    return await sock.relayMessage(jid, {
        buttonsMessage: {
            locationMessage: {
                degreesLatitude: 0,
                degreesLongitude: 0,
                name: "ᴀʀᴀꜱʜɪ ʙᴏᴛ",
                address: "ᴋᴀᴅᴏ × ᴀʀᴀꜱʜɪ",
                jpegThumbnail: MENU_THUMBNAIL
            },
            contentText,
            footerText: "ᴀʀᴀꜱʜɪ ʙᴏᴛ • ᴀꜱꜱɪꜱᴛᴀɴᴛ & ᴄᴏᴅɪɴɢ ᴀɢᴇɴᴛ",
            contextInfo: {
                stanzaId: m.key.id,
                participant: m.key.participant || m.key.remoteJid,
                quotedMessage: m.message
            },
            buttons: [
                {
                    buttonId: "menu_select",
                    buttonText: {
                        displayText: "ᴘɪʟɪʜ ᴍᴇɴᴜ"
                    },
                    type: 1,
                    nativeFlowInfo: {
                        name: "single_select",
                        paramsJson: JSON.stringify({
                            title: "ᴘɪʟɪʜ ᴋᴀᴛᴇɢᴏʀɪ",
                            sections
                        })
                    }
                }
            ],
            headerType: 6
        }
    }, {
        additionalNodes: [
            {
                tag: "biz",
                attrs: {},
                content: [
                    {
                        tag: "interactive",
                        attrs: {
                            type: "native_flow",
                            v: "1"
                        },
                        content: [
                            {
                                tag: "native_flow",
                                attrs: {
                                    v: "9",
                                    name: "mixed"
                                }
                            }
                        ]
                    }
                ]
            }
        ]
    })
}

const categoryBlock = (category, commands) =>
    `${BULLET}  *${category}*\n\n${commands.map(c => `- ${c}`).join("\n")}`

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, text, prefix, command, menuManager } = ctx
    const p = `${prefix ?? ""}menu`

    // bangun ulang tiap dipanggil biar plugin baru langsung muncul tanpa restart
    menuManager.buildMenu()

    const { categoryArray, categoryMap } = menuManager
    const input = (text || "").trim().toLowerCase()

    // Jika user panggil "menu button", "menu btn", atau alias "menubutton" / "menubtn"
    if (command === "menubutton" || command === "menubtn" || input === "button" || input === "btn") {
        return await sendButtonMenu(ctx)
    }

    if (!input) {
        const list = categoryArray.map(c => `${BULLET}  *${c}*`).join("\n")
        return await sendMenu(ctx,
            `list of menu categories\n\n${list}\n\n` +
            `> ${p} button untuk tampilan interactive button\n` +
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

/** @type {PluginType} */
const plugin = {
    run,
    name: "menu",
    commands: ["menu", "menubutton", "menubtn"],
    categories: ["main"],
    description: "menampilkan menu per kategori (teks atau button interaktif). tampilannya diatur lewat command theme & button."
}

plugin.meta = {
    filename: "menu.js",
    version: "3",
    author: "Kado x Arashi",
    note: "mendukung interactive single_select dropdown button dengan thumbnail Lynette dan locationMessage",
    path: "main"
}

export default plugin
