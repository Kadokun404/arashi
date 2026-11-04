/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { config } from "#root/config.js"

const BULLET = "•"

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
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, text, prefix, menuManager, pluginManager, prefixManager } = ctx
    const p = prefix ?? ""

    // Bangun ulang struktur menu agar plugin baru langsung terdaftar
    menuManager.buildMenu()

    const { categoryArray, categoryMap } = menuManager
    const totalCommands = pluginManager?.pluginMap?.size || 0
    const totalPlugins = pluginManager?.pluginArray?.length || 0

    const userName = m.pushName || (ctx.isOwner ? config.devName : "User")
    const userRole = ctx.isOwner ? "Owner" : (ctx.isAdmin ? "Admin" : "User")
    const uptime = formatUptime(process.uptime())
    const pStatus = prefixManager?.getStatus?.()
    const prefixDisplay = pStatus?.isPrefixActive ? `[ ${pStatus.prefixList.join(" , ")} ]` : "Multi / No Prefix"

    const input = (text || "").trim().toLowerCase()

    // Tampilkan seluruh menu jika tanpa parameter atau ketik "all"
    if (!input || input === "all") {
        let menuBody = ""
        for (const cat of categoryArray) {
            const entry = categoryMap.get(cat)
            if (!entry) continue
            menuBody += `*┌──〔 ${cat.toUpperCase()} 〕*\n`
            for (const cmd of entry.textArray) {
                menuBody += `*│* ${BULLET} ${p}${cmd}\n`
            }
            menuBody += `*└──*\n\n`
        }

        const caption =
`╭──〔 *${config.botName || "ARASHI BOT"}* 〕
│ • Nama   : *${userName}*
│ • Role   : *${userRole}*
│ • Prefix : *${prefixDisplay}*
│ • Uptime : *${uptime}*
│ • Fitur  : *${totalCommands} Command (${totalPlugins} Plugin)*
╰──────────────

${menuBody.trim()}

> Ketik *${p}menu <kategori>* untuk melihat kategori tertentu.`

        return await m.arashirep(caption)
    }

    const entry = categoryMap.get(input)
    if (!entry) {
        return await m.arashirep(`❌ Kategori *${text.trim()}* tidak ditemukan.\n\nKategori yang tersedia:\n${categoryArray.map(c => `• ${c}`).join("\n")}`)
    }

    let singleBody = `*┌──〔 ${input.toUpperCase()} 〕*\n`
    for (const cmd of entry.textArray) {
        singleBody += `*│* ${BULLET} ${p}${cmd}\n`
    }
    singleBody += `*└──*`

    return await m.arashirep(singleBody)
}

/** @type {PluginType} */
const plugin = {
    run,
    name: "menu",
    commands: ["menu", "help"],
    categories: ["main"],
    description: "Menampilkan daftar menu dan perintah bot berbasis teks bersih"
}

plugin.meta = {
    filename: "menu.js",
    version: "1.0.0",
    author: "Kadokun",
    note: "Menu bot teks bersih dan modular",
    path: "main"
}

export default plugin
