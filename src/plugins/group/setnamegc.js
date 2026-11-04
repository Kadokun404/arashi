/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { ownerManager } from "#manager/owner-manager.js"
import { chatManager } from "#manager/chat-manager.js"

const MAX_SUBJECT_LENGTH = 25 // limit dari whatsapp sendiri

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text, command } = ctx

    if (!chatManager.isGroupJid(jid)) {
        return await m.arashirep(`command *${command}* cuma bisa dipake di grup`)
    }

    const metadata = await sock.groupMetadata(jid)
    const isAdmin = metadata.participants.find(p => p.id === m.contact?.lid)?.admin

    const isAllowed = ownerManager.isOwner(m.contact) || !!isAdmin
    if (!isAllowed) {
        return await m.arashirep(`cuma admin grup / owner yang bisa ganti nama grup`)
    }

    const newName = (text || '').trim()
    if (!newName) {
        return await m.arashirep(`kasih nama baru nya kak\n\ncontoh: *${command} Nama Grup Baru*`)
    }

    if (newName.length > MAX_SUBJECT_LENGTH) {
        return await m.arashirep(`nama grup kepanjangan (maks ${MAX_SUBJECT_LENGTH} karakter), punya kamu ${newName.length} karakter`)
    }

    try {
        await sock.groupUpdateSubject(jid, newName)
        return await m.arashirep(`✅ nama grup berhasil diganti jadi *${newName}*`)
    } catch (e) {
        return await m.arashirep(`❌ gagal ganti nama grup: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "set group name",
    commands: ["setnamegc", "sng"],
    categories: ["group"],
    description: "ganti nama/subject grup (admin/owner only), contoh: *setnamegc Nama Grup Baru*"
}

plugin.meta = {
    filename: "setnamegc.js",
    version: "1",
    author: "Kado",
    note: "pake sock.groupUpdateSubject standard, admin nya di cek live lewat sock.groupMetadata(jid) sama kaya promote.js/open-close.js",
    path: "group"
}

export default plugin
