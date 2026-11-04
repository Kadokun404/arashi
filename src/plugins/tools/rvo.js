import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q } = ctx

    const wamc = q?.message
    if (!wamc) return await m.arashirep('reply ke viewonce')

    const isVo = wamc[q?.content]?.viewOnce
    if (!isVo) return await m.arashirep('bukan pesan view once')

    delete wamc[q?.content]?.viewOnce

    await sock.relayMessage(jid, wamc, {})

    await m.arashirep('✅ restored')
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "reveal viewonce",
    commands: ["rvo", "dwm"],
    categories: ["tools"],
    description: "buka media viewonce"
}

plugin.meta = {
    filename: "rvo.js",
    version: "1",
    author: config.devName,
    note: "gabut",
    path: "tools"
}

export default plugin