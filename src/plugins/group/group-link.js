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
        return await m.arashirep(`cuma admin grup / owner yang bisa liat link invite grup`)
    }

    try {
        const code = await sock.groupInviteCode(jid)
        return await m.arashirep(`🔗 link invite grup *${metadata.subject}*:\nhttps://chat.whatsapp.com/${code}`)
    } catch (e) {
        return await m.arashirep(`❌ gagal ambil link invite grup: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "group invite link",
    commands: ["linkgc", "grouplink", "gclink", "link"],
    categories: ["group"],
    description: "liat link invite grup (admin/owner only)"
}

plugin.meta = {
    filename: "group-link.js",
    version: "1",
    author: "Kado",
    note: "pake sock.groupInviteCode standard, admin nya di cek live lewat sock.groupMetadata(jid) sama kaya setnamegc.js/revoke.js",
    path: "group"
}

export default plugin
