import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, jid, m, q } = ctx
    const wam = q || m

    try {
        const anime = await fetch('https://api.nexray.eu.cc/random/loli')

        await sock.sendMessage(
            jid,
            {
                image: anime
            },
            {
                quoted: wam
            }
        )


    } catch (err) {
        console.error(err)
        return `error: ${err.message}`
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "random loli",
    commands: ["loli"],
    categories: ["random"],
    description: "random loli"
}

plugin.meta = {
    filename: "loli.js",
    author: config.devName,
    note: "",
    version: "1",
    path: "random"
}

export default plugin