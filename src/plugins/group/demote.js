/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { ownerManager } from "#manager/owner-manager.js"
import { chatManager } from "#manager/chat-manager.js"
import { resolveTargets } from "#helper/resolve-target.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid } = ctx

    if (!chatManager.isGroupJid(jid)) {
        return await m.arashirep(`command ini cuma bisa dipake di grup`)
    }

    const metadata = await sock.groupMetadata(jid)
    const isAdmin = (lid) => metadata.participants.find(p => p.id === lid)?.admin

    const isAllowed = ownerManager.isOwner(m.contact) || !!isAdmin(m.contact.lid)
    if (!isAllowed) {
        return await m.arashirep(`cuma admin grup / owner yang bisa demote admin`)
    }

    const { targets } = resolveTargets(ctx)
    const validTargets = targets.filter(t => t?.lid)

    if (!validTargets.length) {
        return await m.arashirep(`reply atau mention/tag admin yang mau diturunin (demote)`)
    }

    const targetLids = validTargets.map(t => t.lid)

    try {
        await sock.groupParticipantsUpdate(jid, targetLids, 'demote')
        return await sock.sendMessage(jid, {
            text: `✅ ${targetLids.map(lid => `@${lid.split('@')[0]}`).join(' ')} berhasil diturunin dari admin`,
            mentions: targetLids
        }, { quoted: m.raw })
    } catch (e) {
        return await m.arashirep(`❌ gagal demote: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "demote",
    commands: ["demote"],
    categories: ["group"],
    description: "turunin admin grup jadi member biasa (reply/mention, bisa lebih dari satu)"
}

plugin.meta = {
    filename: "demote.js",
    version: "2",
    author: "Kado",
    note: "cek admin nya langsung live lewat sock.groupMetadata(jid), gak pake cache lokal biar selalu akurat",
    path: "group"
}

export default plugin