/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { pluginEnableManager } from "#manager/plugin-enable-manager.js"

const HELP_TEXT = `halo sayangg, kali ini aku bakal jelasin fitur disable cmd, ada 3 opsi yang bisa kamu mainin:\n` +
    `cmd off <command> [ disable fitur tertentu, owner tetep bisa pakai ya ]\n` +
    `cmd on <command> [ gausa di jelasin yah cape aku :3 ]\n` +
    `Tips: kamu bisa pake cmd list buat liat apa aja yang disable`
/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return
    const { m, text, pluginManager } = ctx

    const trimmed = (text || '').trim()
    const [subcommand, ...rest] = trimmed.split(/\s+/)
    const command = rest.join(' ').trim().replace(/^\*|\*$/g, '')

    if (subcommand === "off" || subcommand === "disable") {
        if (!command) return await m.arashirep(`${HELP_TEXT}`)
        if (!pluginManager.pluginMap.has(command)) return await m.arashirep(`${command} itu gada byy`)

        const authorContact = m.contact
        const result = await pluginEnableManager.disable(command, { lid: authorContact?.lid, pn: authorContact?.pn })
        return await m.arashirep(result.message)
    }

    if (subcommand === "on" || subcommand === "enable") {
        if (!command) return await m.arashirep(`nama fiturnya apa?`)

        const result = await pluginEnableManager.enable(command)
        return await m.arashirep(result.message)
    }

    if (subcommand === "list" || !subcommand) {
        const rows = pluginEnableManager.list()
        if (!rows.length) return await m.arashirep(`gak ada command yang di-disable`)

        const lines = rows.map((row, i) => `${i + 1}. ${row.command} [ disable fitur ] ${row.disabledAt}`)
        return await m.arashirep(`fitur yang disable:\n${lines.join('\n')}`)
    }

    return await m.arashirep(HELP_TEXT)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "toggle command",
    commands: ["cmd"],
    categories: ["owner"],
    description: `nyala/matiin command tertentu\n\n${HELP_TEXT}`
}

plugin.meta = {
    filename: "plugin-toggle.js",
    version: "1",
    author: "Kadokun",
    note: "e",
    path: "owner"
}

export default plugin
