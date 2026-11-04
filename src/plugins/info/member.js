/**
 * @import {Plugin, PluginCtx} from "#types/types.js"
 */

import { db } from '#database/database.js'
import { humanTimeFromSecond } from '#helper/common.js'

/**
 * main fungsi plugin
 * @param { PluginCtx } ctx
 * @returns { Promise <any> } */
async function run(ctx) {
    const { sock, m, q, text, jid } = ctx
    const wam = q || m

    const chatId = wam.chat.id
    const contactId = wam.contact.id

    const result = stmt.get({
        chatId,
        contactId
    })

    if (!result) return await m.arashirep(`👻 no result from database`)

    const print = parse(result)

    return await sock.sendMessage(jid, {
        text: print
    })
}

const stmt = db.prepare(`

SELECT 
contact.push_name as name,
gp.invited_at as invitedAt,
contactInvitedBy.push_name as invitedBy,
gp.admin as role,
gp.admin_updated_at as roleUpdatedAt,
contactAdminUpdatedBy.push_name as roleUpdatedBy,
gp.label as label,
gp.label_updated_at as labelUpdatedAt,
gp.chat_id

FROM group_participants gp

LEFT JOIN contacts contact
ON gp.contact_id = contact.id

LEFT JOIN contacts contactInvitedBy
ON gp.invited_by = contactInvitedBy.id

LEFT JOIN contacts contactAdminUpdatedBy
ON gp.admin_updated_by = contactAdminUpdatedBy.id

WHERE chat_id = :chatId
AND contact_id = :contactId
--AND gp.kicked_at IS NULL
ORDER BY
	gp.invited_at DESC


`)

const parse = (r) => {
    const NULL_FALLBACK = '-'
    const { name, invitedAt, invitedBy, role, roleUpdatedBy, roleUpdatedAt, label, labelUpdatedAt } = r

    const kataKata = `*🪪 member inspect*

name : ${name ?? NULL_FALLBACK}
since : ${humanTimeFromSecond(invitedAt) ?? NULL_FALLBACK}
by : ${invitedBy ?? NULL_FALLBACK}

role: ${role ?? 'member'}
at : ${humanTimeFromSecond(roleUpdatedAt) ?? NULL_FALLBACK}
by : ${roleUpdatedBy ?? NULL_FALLBACK}

label : ${label ?? (labelUpdatedAt ? '(di hapus)' : NULL_FALLBACK)}
at : ${humanTimeFromSecond(labelUpdatedAt) ?? NULL_FALLBACK}`

    return kataKata
}

const plugin = { run }
plugin.name = "member info"
plugin.commands = ["mi"]
plugin.categories = ["info"]
plugin.description = "menampilkan sedikit catatan digital seseorang, cocok di coba dalam sebuah grup"

plugin.meta = {
    filename: "member.js",
    author: "kado",
    note: "gabut",
    path: "info",
    version: "1"
}

export default plugin