import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return
    const { sock, m, jid } = ctx

    if (!m.message?.reactionMessage) return
    
    const key = m.message.reactionMessage.key
    await sock.sendMessage(jid, { delete: key })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "react delete",
    commands: ["❌"],
    categories: ["owner"],
    description: "buat hapus pesan (bot & user) by react"
}

plugin.meta = {
    filename: "react-delete.js",
    version: "1.0.0",
    author: config.devName,
    note: "hapus pesan bot & user",
path: "owner"
}

export default plugin