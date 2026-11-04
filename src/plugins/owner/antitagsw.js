/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { antiTagSwManager } from "#manager/antitagsw-manager.js"

async function run(ctx) {
    const { m, jid, text, isAdmin, isOwner } = ctx
    if (!isAdmin && !isOwner) return await m.arashirep("khusus admin/owner")

    const sub = (text || "").trim().toLowerCase()

    if (sub === "on") {
        antiTagSwManager.enable(jid)
        return await m.arashirep("✅ antitagsw diaktifkan di grup ini")
    }
    if (sub === "off") {
        antiTagSwManager.disable(jid)
        return await m.arashirep("✅ antitagsw dimatikan di grup ini")
    }

    return await m.arashirep(
        `antitagsw status: ${antiTagSwManager.isEnabled(jid) ? "AKTIF" : "MATI"}\n\n` +
        `antitagsw on\nantitagsw off`
    )
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "antitagsw",
    commands: ["antitagsw"],
    categories: ["owner"],
    description: "hapus pesan tag status/SW grup tanpa izin admin"
}

plugin.meta = {
    filename: "antitagsw.js",
    version: "1",
    author: "Kado",
    note: "hapus otomatis tag status/SW grup",
    path: "owner"
}

export default plugin
