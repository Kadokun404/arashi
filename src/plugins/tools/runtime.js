/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import fs from "fs"
import path from "path"
import { config } from "#root/config.js"

/**
 * Format durasi runtime bot
 * @param {number} seconds
 * @returns {string}
 */
function formatRuntime(seconds) {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)

    return [
        d && `${d} hari`,
        h && `${h} jam`,
        m && `${m} menit`,
        s && `${s} detik`
    ].filter(Boolean).join(' ') || '0 detik'
}

function getUptimeSeconds() {
    const uptimeFile = path.join(process.cwd(), "data", "uptime.json")
    try {
        if (fs.existsSync(uptimeFile)) {
            const raw = JSON.parse(fs.readFileSync(uptimeFile, "utf-8"))
            if (raw?.startTime && Number.isFinite(raw.startTime)) {
                return Math.floor((Date.now() - raw.startTime) / 1000)
            }
        }
    } catch {}

    if (process.env.BOT_START_TIME) {
        const start = Number(process.env.BOT_START_TIME)
        if (Number.isFinite(start) && start > 0) {
            return Math.floor((Date.now() - start) / 1000)
        }
    }

    return Math.floor(process.uptime())
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m } = ctx

    const runtime = formatRuntime(getUptimeSeconds())

    await m.arashirep(`Runtime: ${runtime}`)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "runtime",
    commands: ["runtime", "rt", "rtt", "runtimee"],
    categories: ["tools"],
    description: "cek runtime bot"
}

plugin.meta = {
    filename: "runtime.js",
    version: "4",
    author: "Kado",
    note: "runtime sederhana",
    path: "tools"
}

export default plugin