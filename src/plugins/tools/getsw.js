/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    if (!q) return await m.arashirep('reply status yang mau diambil kak')
    if (q.content !== 'groupStatusMessageV2') return await m.arashirep('reply status grup untuk menggunakan perintah ini')

    const targetJid = text?.trim() === '-p' ? m.contact.pn : jid

    const wrapped = q.message[q.content].message
    const wamType = Object.keys(wrapped)[0]
    const content = wrapped[wamType]
    delete content.contextInfo?.isGroupStatus

    await sock.relayMessage(targetJid, { [wamType]: content }, {})
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "get status whatsapp",
    commands: ["getsw"],
    categories: ["tools"],
    description: "ambil status grup yang di reply, tambah -p untuk kirim ke private"
}

plugin.meta = {
    filename: "getsw.js",
    version: "4",
    author: "Kado",
    note: "gabut",
    path: "tools"
}

export default plugin