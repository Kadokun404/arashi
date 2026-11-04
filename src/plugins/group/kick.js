/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, q } = ctx

    // via reply
    let targetLid = q?.contact?.lid
    // via mention/tag
    if (!targetLid) {
        const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid
        if (mentioned?.length) targetLid = mentioned[0]
    }

    if (!targetLid) return await m.arashirep('reply atau mention/tag target yang mau di kick')

    const base = {
        author: m.contact?.name ?? m.sender,
        target: {
            lid: targetLid,
            pn: q?.contact?.pn,
        },
        group: m.chat.jid
    }
    try {
        await sock.groupParticipantsUpdate(m.chat.jid, [targetLid], 'remove')
        await sock.sendMessage(m.chat.jid, {
            text: `${JSON.stringify({ kick: 'success', ...base }, null, 2)}\n\n> @${targetLid.split('@')[0]} has been kicked`,
            mentions: [targetLid]
        }, { quoted: m.raw })
    } catch (e) {
        await m.arashirep(`${JSON.stringify({ kick: 'failed', reason: e.message, ...base }, null, 2)}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "kick",
    commands: ["kick"],
    categories: ["group"],
    description: "kick member dari grup"
}

plugin.meta = {
    filename: "kick.js",
    version: "7",
    author: "Kado",
    note: "",
    path: "group"
}

export default plugin