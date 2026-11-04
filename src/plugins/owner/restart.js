/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import fs from "node:fs/promises"
import { allPaths } from "#root/src/all-paths.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return
    const { m, jid } = ctx

    await m.arashirep('ya, sbntr')

    // simpen jid tujuan biar abis restart (proses baru nyala lagi) bot bisa
    // ngasih tau "udah bangkit lagi" ke chat yang sama. di baca sekali pas
    // koneksi open, terus di hapus lagi (biar gak keulang tiap konek ulang)
    try {
        await fs.writeFile(allPaths.restartFlag, JSON.stringify({ jid, requestedAt: Date.now() }))
    } catch (err) {
        console.error('[restart] gagal nyimpen restart flag', err)
    }

    setTimeout(() => {
        process.exit(0)
    }, 1000)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "restart",
    commands: ["restart", "rs"],
    categories: ["owner"],
    description: "restart bot"
}

plugin.meta = {
    filename: "restart.js",
    version: "1.1",
    author: "Kado",
    note: "abis restart bakal ngasih pesan 'minaa bangkit kembalii, siap bermain kado?' ke chat yang sama",
    path: "owner"
}

export default plugin