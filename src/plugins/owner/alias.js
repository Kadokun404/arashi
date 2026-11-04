/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { aliasManager } from "#manager/alias-manager.js"
import { config } from "#root/config.js"

const HELP_TEXT = `hey! for us this feature\n` +
    `ada 3 opsi yang bisa kamu mainin:\n` +
    `alias add name [ fungsinya untuk menambah variabel pengganti sock ]\n` +
    `alias delete name [ buat ngahapus alias yang udah kamu add ]\n\n` +
    `alias view [ ya buat liat ada alias apa aja, alias ini bisa kamu pake buat sock.sendMessage gitu, di ganti sock nya sesuai alias ]`

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return
    const { m, sock, text } = ctx

    const trimmed = (text || '').trim()
    const subcommand = trimmed.split(/\s+/)[0]?.toLowerCase()
    const name = trimmed.slice(subcommand?.length || 0).trim()

    if (subcommand === "add") {
        const result = await aliasManager.add(name, sock)
        return await m.arashirep(result.message)
    }

    if (subcommand === "delete" || subcommand === "del" || subcommand === "remove") {
        const result = await aliasManager.delete(name)
        return await m.arashirep(result.message)
    }

    if (subcommand === "view" || subcommand === "list" || !subcommand) {
        const names = aliasManager.list()
        if (!names.length) return await m.arashirep(`belum ada alias. bikin dulu pake *alias add <name>*`)
        return await m.arashirep(`your alias name:\n${names.map(n => `- ${n}`).join('\n')}`)
    }

    return await m.arashirep(HELP_TEXT)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "alias",
    commands: ["alias"],
    categories: ["owner"],
    description: `bikin alias global buat sock, misal *alias add isha* terus bisa dipake \`isha.sendMessage(...)\` di script lain\n\n${HELP_TEXT}`
}

plugin.meta = {
    filename: "alias.js",
    version: "1.0.0",
    author: config.devName,
    note: "pake aliasManager, nama nya persist & otomatis di re-apply tiap reconnect (liat bot.js)",
    path: "owner"
}

plugin.config = {
    protected: false
}

export default plugin