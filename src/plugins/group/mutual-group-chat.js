import { db } from '../../database/database.js'
import { humanTimeFromSecond } from '#helper/common.js'
import { config } from "#root/config.js"

/**
 * @import {PluginCtx} from "../../types/types.js"
 */

/**@param {PluginCtx} ctx */
async function run(ctx) {
    const { sock, m, q, text, jid } = ctx
    const wam = q || m

    const contactId = wam.contact.id

    const result = stmt.all({
        contactId
    })

    if (!result) return await m.arashirep(`no result from database O.o`)

    const print = parse(result, ctx)

    return await sock.sendMessage(jid, {
        text: print
    })
}

const stmt = db.prepare(`

SELECT
chats.name as gcName,
gp.admin as role,
gp.kicked_at as kickedAt,
kicker.push_name as kickedBy
FROM group_participants gp

LEFT JOIN chats
ON gp.chat_id = chats.id

LEFT JOIN contacts kicker
ON gp.kicked_by = kicker.id

WHERE gp.contact_id = :contactId
ORDER BY
lower(chats.name)

`)

/**
 * 
 * @param {*} resultDatabase 
 * @param {PluginCtx} ctx 
 */
const parse = (resultDatabase, ctx) => {
    const { jid, sock, m, q } = ctx
    const gcSuperAdmin = []
    const gcAdmin = []
    const gcMember = []
    const gcOut = []

    resultDatabase.forEach(v => {
        const { gcName, role, kickedAt, kickedBy } = v
        if (role === "superadmin") {
            gcSuperAdmin.push(gcName)
        }

        else if (role === "admin") {
            gcAdmin.push(gcName)
        }

        else if (kickedAt)
            gcOut.push({
                gcName,
                kickedBy,
                kickedAt
            })
        else {
            gcMember.push(gcName)
        }
    })

    const wam = q || m
    const name = wam?.contact?.name || `beliau`
    const totalGc = gcSuperAdmin.length + gcAdmin.length + gcMember.length
    const p_name = `${name} join ${totalGc} group chats!\n\n`

    const p_gc_superadmin_full = `*role superadmin*` + ` (${gcSuperAdmin.length} gc)\n` +
        (gcSuperAdmin
            .map(v => `- ${v}`)
            .join('\n') || "-") + '\n\n'

    const p_gc_admin_full = `*role admin*` + ` (${gcAdmin.length} gc)\n` +
        (gcAdmin
            .map(v => `- ${v}`)
            .join('\n') || "-") + '\n\n'

    const p_gc_member_full = `*role member*` + ` (${gcMember.length} gc)\n` +
        (gcMember
            .map(v => `- ${v}`)
            .join('\n') || "-") + '\n\n'

    const p_gc_out_full = `*gc out (${gcOut.length})*\n` +
        (gcOut
            .map(v => "- " + v.gcName +
                '\n> kicked by ' + v.kickedBy +
                '\n> pada ' + humanTimeFromSecond(v.kickedAt))
            .join('\n') || "-")

    const print = p_name
        + p_gc_superadmin_full
        + p_gc_admin_full
        + p_gc_member_full
        + p_gc_out_full

    return print
}

const plugin = { run }
plugin.name = "mutual group chat"
plugin.commands = ["mgc"]
plugin.categories = ["group"]
plugin.description = "buat nampilin mutual gc antara bot dan contact"

plugin.meta = {
    filename: "mutual-group-chat.js",
    author: config.devName,
    note: "plugin gabut buat test query O.o",
    version: "1",
    path: "group"
}

export default plugin