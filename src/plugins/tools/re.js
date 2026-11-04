import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * 
 * @param {PluginCtx} ctx 
 * @returns 
 */
async function run(ctx) {
    const { m, jid } = ctx
    const name = m.contact.name || 'kamu'
    return await re.sendMessage(jid,{ text: "aloo aku alias sock, re", m
})
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "ping",
    commands: ["re"],
    categories: ["tools"],
    description: "cek bot apakah ok atau gak ok"
}

plugin.meta = {
    filename: "re.js",
    version: "1",
    author: config.devName,
    note: "idk",
    path: "tools"
}

export default plugin