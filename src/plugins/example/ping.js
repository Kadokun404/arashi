/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * Contoh plugin sederhana untuk panduan developer
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, sock, jid } = ctx
    const start = Date.now()

    await m.arashirep("🏓 Pong!")
}

/** @type {PluginType} */
const plugin = {
    run,
    name: "ping",
    commands: ["ping", "p"],
    categories: ["example"],
    description: "Cek responsivitas bot (contoh plugin starter)",
    config: {
        protected: false,
        bypassPrefix: false
    }
}

plugin.meta = {
    filename: "ping.js",
    version: "1.0.0",
    author: "Kadokun",
    note: "Plugin contoh untuk pengembangan fitur baru",
    path: "example"
}

export default plugin
