import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, q, m, prefix, command } = ctx
    const jid = m.chat.jid

    if (!jid.endsWith('@g.us')) {
        return await m.arashirep(`command ini cuma bisa dipake di grup`)
    }

    const source = q?.content === "imageMessage"
        ? q
        : m?.content === "imageMessage"
            ? m
            : null

    if (!source) {
        return await m.arashirep(`reply foto atau kirim foto dengan caption command ya\n\ncontoh: *${prefix ? prefix + ' ' : ''}${command}* (reply ke foto, atau kirim foto + caption *${command}*)`)
    }

    try {
        const buffer = await source.download("buffer")

        await sock.updateProfilePicture(jid, buffer)

        return await m.arashirep(`✅ foto profil grup berhasil diganti`)
    } catch (err) {
        console.error(err)
        return await m.arashirep(`gagal ganti foto profil grup: ${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "set profile picture group",
    commands: ["setppgc", "setppgroup"],
    categories: ["group"],
    description: "ganti foto profil grup (reply ke foto atau kirim foto + caption command)"
}

plugin.meta = {
    filename: "setppgc.js",
    author: config.devName,
    note: "pake sock.updateProfilePicture standard, tanpa compress",
    version: "1",
    path: "group"
}

export default plugin