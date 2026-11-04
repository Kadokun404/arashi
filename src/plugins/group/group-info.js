/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { chatManager } from "#manager/chat-manager.js"
import { antilinkManager } from "#manager/antilink-manager.js"
import { antiSwGcManager } from "#manager/antiswgc-manager.js"
import { groupOpenCloseManager, GroupState } from "#manager/group-open-close-manager.js"

const STATE_LABEL = {
    [GroupState.OPEN]: "🔓 terbuka",
    [GroupState.CLOSED]: "🔒 tertutup"
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid } = ctx

    if (!chatManager.isGroupJid(jid)) {
        return await m.arashirep(`command ini cuma bisa dipake di grup`)
    }

    const metadata = await sock.groupMetadata(jid)
    const admins = metadata.participants.filter(p => p.admin)

    const totalMember = metadata.participants.length
    const totalAdmin = admins.length
    const antilinkConfig = antilinkManager.getConfig(jid)
    const antilinkStatus = antilinkConfig.enabled ? "on" : "off"
    const antiswgcStatus = antiSwGcManager.isEnabled(jid) ? "on" : "off"
    const groupStatus = STATE_LABEL[groupOpenCloseManager.getState(jid)]

    const caption = `*Info Grup*\n\n` +
        `Nama: ${metadata.subject}\n` +
        `ID: ${jid}\n` +
        `Member: ${totalMember}\n` +
        `Admin: ${totalAdmin}\n` +
        `Status: ${groupStatus}\n` +
        `Antilink: ${antilinkStatus}\n` +
        `Antiswgc: ${antiswgcStatus}`

    const ppUrl = await sock.profilePictureUrl(jid, 'image').catch(() => null)

    if (ppUrl) {
        return await sock.sendMessage(jid, {
            image: { url: ppUrl },
            caption
        }, { quoted: m.raw })
    }

    return await m.arashirep(caption)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "group info",
    commands: ["groupinfo", "gcinfo", "infogc"],
    categories: ["group"],
    description: "liat info grup: nama, id, total member, total admin, status buka/tutup, foto profil grup, dan status antilink"
}

plugin.meta = {
    filename: "group-info.js",
    version: "2",
    author: "Kado",
    note: "admin di ambil langsung live lewat sock.groupMetadata(jid), gak pake cache lokal",
    path: "group"
}

export default plugin