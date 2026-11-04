/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { promisify } from 'node:util'
import { exec } from 'node:child_process'
import { config } from "#root/config.js"

const execPromise = promisify(exec)

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return
    const { m, text } = ctx

    try {
        const { stdout, stderr } = await execPromise(text)
        let output = stdout || stderr || '✅ Tidak ada output.'
        /*if (output.length > 1) output = output.substring(0, 1000) + '\n\n[Output terpotong...]'*/
        await m.arashirep(output.trim())
    } catch (e) {
        await m.arashirep(`❌ Error:\n${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "shell",
    commands: ["$"],
    categories: ["owner"],
    description: "jalanin perintah shell/terminal"
}

plugin.meta = {
    filename: "shell.js",
    version: "1",
    author: config.devName,
    note: "debag debug",
    path: "owner"
}

plugin.config = {
    bypassPrefix: true
}

export default plugin