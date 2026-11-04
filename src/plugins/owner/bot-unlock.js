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

    if (!isOwner) return await m.arashirep("Perintah ini khusus owner.")

    const name = text?.trim()

    if (name) {
        if (!botNameManager.exists(name)) {
            return await m.arashirep(`nama "${name}" belum ke daftar, pakai "name add ${name}" dulu`)
        }
        const r = botNameManager.unlock(name)
        return await m.arashirep(r.message)
    }

    if (!global.isBotLocked) return await m.arashirep("Bot is not Locked, want to locked me?")

    delete global.isBotLocked
    return await m.arashirep("Bot Unlocked.")
}

/**@type {Plugin} */
const plugin = { run }

plugin.name = "unlock bot"
plugin.commands = ["unlock"]
plugin.categories = ["owner"]
plugin.description = "Membuka kunci bot (khusus owner). Gunakan 'unlock <nama>' untuk membuka kunci nama bot tertentu saja (fitur multi-nama)."

plugin.meta = {
    filename: "bot-unlock.js",
    author: config.devName,
    note: "v4: fix -- 'unlock <nama>' yang namanya gak ke daftar sekarang error, bukan nyasar ngebuka global lock. pasangan dari bot-lock.js v5.",
    version: "4",
    path: "owner"
}

plugin.config = {
    protected: true,
    bypassPrefix: true,
    bypassLock: true
}

export default plugin