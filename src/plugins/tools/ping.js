import { performance } from "node:perf_hooks"

/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

// simple ping: just measure & reply response time, no more system/cpu/mem dump
/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, jid, m } = ctx
    const start = performance.now()

    const sent = await sock.sendMessage(jid, { text: "🏓 pong!" }, { quoted: m })
    const ms = Math.max(1, Math.round(performance.now() - start))

    try {
        if (sent?.key) {
            await sock.sendMessage(jid, { text: `🏓 pong! ${ms}ms`, edit: sent.key })
        }
    } catch (e) {
        console.error("[ping] edit error:", e)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "ping",
    commands: ["ping", "speed", "p", "latency"],
    categories: ["tools"],
    description: "cek response time bot (simple)"
}

plugin.meta = {
    filename: "ping.js",
    version: "3",
    author: "kado",
    note: "v3: simplified, cuma response time doang (dulu ada system/cpu/mem dump, sekarang dibuang biar ringan & rapi)",
    path: "tools"
}

plugin.config = {
    protected: true,
    bypassPrefix: true
}

export default plugin
