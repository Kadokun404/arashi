/**
 * @import {PluginCtx, Plugin} from "../types/types.js"
 */

import { config } from "#root/config.js"
import { botNameManager } from "#manager/bot-name-manager.js"

/**
 * @param {PluginCtx} ctx
 * @returns {Promise<any>}
 */
async function run(ctx) {
    const { m, text, isOwner } = ctx

    if (!isOwner) return 
    const name = text?.trim()

 
    if (name) {
        if (!botNameManager.exists(name)) {
            return await m.arashirep(`nama "${name}" belum ke daftar, pakai "name add ${name}" dulu`)
        }
        const r = botNameManager.lock(name)
        return await m.arashirep(r.message)
    }

    if (global.isBotLocked) return await m.arashirep("Bot is Locked. Nothing changes.")

    global.isBotLocked = true
    return await m.arashirep("Bot Locked.")
}

/**@type {Plugin} */
const plugin = { run }

plugin.name = "lock bot"
plugin.commands = ["lock"]
plugin.categories = ["owner"]
plugin.description = "Mengunci bot secara global (khusus owner) sehingga semua command berhenti merespons kecuali unlock. Gunakan 'lock <nama>' untuk mengunci nama bot tertentu saja (fitur multi-nama)."

plugin.meta = {
    filename: "bot-lock.js",
    author: config.devName,
    note: "",
    version: "5",
    path: "owner"
}

plugin.config = {
    protected: true,
    bypassPrefix: true,
    bypassLock: true
}

export default plugin