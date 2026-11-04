/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { themeManager } from "#manager/theme-manager.js"
import { config } from "#root/config.js"

/**
 * @param {number} bytes
 * @returns {number} MB
 */
function toMb(bytes) {
    return bytes / 1024 / 1024
}

/**
 * @param {number} mb
 * @returns {string}
 */
function formatMb(mb) {
    return mb.toFixed(1)
}

/**
 * @typedef {object} MemMetric
 * @property {string} label
 * @property {number} mb
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid } = ctx

    const mem = process.memoryUsage()

    /**@type {MemMetric[]} */
    const metrics = [
        { label: 'rss', mb: toMb(mem.rss) },
        { label: 'heap used', mb: toMb(mem.heapUsed) },
        { label: 'heap total', mb: toMb(mem.heapTotal) },
        { label: 'external', mb: toMb(mem.external) },
        { label: 'buffers', mb: toMb(mem.arrayBuffers) }
    ]

    const botName = themeManager.getData()?.title || config.botName

    const caption = 
        metrics.map(x => `${x.label}: ${formatMb(x.mb)} MB`).join('\n') +
        `\n\nuptime: ${(process.uptime() / 60).toFixed(1)} menit`

    return await sock.sendMessage(jid, { text: caption }, { quoted: m })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "memory",
    commands: ["mem", "memo", "rss"],
    categories: ["tools"],
    description: "cek pemakaian memory bot (teks biasa)"
}

plugin.meta = {
    filename: "memory.js",
    version: "6",
    author: "Kado",
    note: "hapus fitur canvas, balik ke teks biasa biar ringan",
    path: "tools"
}

export default plugin