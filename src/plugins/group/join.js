/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { pendingGroupJoinManager } from "#manager/pending-group-join-manager.js"

const INVITE_LINK_REGEX = /chat\.whatsapp\.com\/([A-Za-z0-9]+)/i

/**
 * @param {string|undefined} text
 * @returns {string|undefined}
 */
function extractInviteCode(text) {
    return text?.match(INVITE_LINK_REGEX)?.[1]
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    // ambil link invite dari argumen langsung, atau dari pesan yang di-reply
    const inviteCode = extractInviteCode(text) || extractInviteCode(q?.text)

    if (!inviteCode) {
        return await m.arashirep(
            `kasih link invite grup nya kak (atau reply pesan yang ada link invite nya)\n\n` +
            `contoh: *join https://chat.whatsapp.com/XXXXXXXXXXXXXXXXX*`
        )
    }

    try {
        // cek dulu info grup nya (termasuk joinApprovalMode) SEBELUM beneran
        // join, biar tau butuh nunggu approval apa langsung masuk
        const inviteInfo = await sock.groupGetInviteInfo(inviteCode)
        const groupName = inviteInfo?.subject || 'grup ini'

        await sock.groupAcceptInvite(inviteCode)

        if (inviteInfo?.joinApprovalMode) {
            // grup butuh persetujuan admin -- request join udah kekirim, tapi
            // belum resmi jadi anggota. daftarin ke pendingGroupJoinManager,
            // nanti otomatis di notif begitu grup nya nongol di event
            // groups.upsert (artinya request udah di-approve)
            pendingGroupJoinManager.add(inviteInfo.id, {
                requesterJid: jid,
                groupName
            })

            return await m.arashirep(
                `⏳ request join ke *${groupName}* udah dikirim, grup ini butuh persetujuan admin.\n` +
                `nanti dikabarin lagi begitu udah di-approve ya kak`
            )
        }

        return await sock.sendMessage(jid, {
            text: `✅ berhasil masuk ke *${groupName}*`
        }, { quoted: m })
    } catch (e) {
        console.error(`gagal join grup`, e)
        return await m.arashirep(`❌ gagal join grup: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "join group",
    commands: ["join"],
    categories: ["group"],
    description: "join grup lewat link invite (langsung atau reply pesan yang ada link nya). kalau grup butuh persetujuan admin, bakal dikabarin lagi begitu udah di-approve"
}

plugin.meta = {
    filename: "join.js",
    version: "1",
    author: "Kado",
    note: "cek joinApprovalMode dulu lewat groupGetInviteInfo sebelum accept invite. kalau butuh approval, daftar ke pendingGroupJoinManager (src/manager/pending-group-join-manager.js), notif otomatis pas grup nongol di event groups.upsert (artinya udah di-approve). kalau gak butuh approval, langsung masuk & langsung dikasih tau",
    path: "group"
}

export default plugin