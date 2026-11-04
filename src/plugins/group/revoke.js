/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { ownerManager } from "#manager/owner-manager.js"
import { chatManager } from "#manager/chat-manager.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, command } = ctx

    if (!chatManager.isGroupJid(jid)) {
        return await m.arashirep(`command *${command}* cuma bisa dipake di grup`)
    }

    const metadata = await sock.groupMetadata(jid)
    const isAdmin = metadata.participants.find(p => p.id === m.contact?.lid)?.admin

    const isAllowed = ownerManager.isOwner(m.contact) || !!isAdmin
    if (!isAllowed) {
        return await m.arashirep(`cuma admin grup / owner yang bisa revoke/reset link invite grup`)
    }

    try {
        const newCode = await sock.groupRevokeInvite(jid)
        return await m.arashirep(`✅ link invite grup berhasil di-reset, link lama udah gak berlaku.\n\nlink baru:\nhttps://chat.whatsapp.com/${newCode}`)
    } catch (e) {
        return await m.arashirep(`❌ gagal revoke link invite grup: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "revoke group link",
    commands: ["revoke", "revokegc", "resetlink"],
    categories: ["group"],
    description: "revoke/reset link invite grup, link lama otomatis gak berlaku lagi (admin/owner only)"
}

plugin.meta = {
    filename: "revoke.js",
    version: "1",
    author: "Kado",
    note: "pake sock.groupRevokeInvite standard, admin nya di cek live lewat sock.groupMetadata(jid) sama kaya setnamegc.js/group-link.js",
    path: "group"
}

export default plugin
