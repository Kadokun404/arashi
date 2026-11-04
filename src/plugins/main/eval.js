/**
 * @import {PluginCtx, PluginConfig, pluginMeta} from "../../types/types.js"
 */

import util from 'node:util'
import crypto from 'node:crypto'
import fs from "node:fs"
import * as baileys from "baileys"
import { sendRich } from "#helper/message/send-rich.js"
/**
 * @param {PluginCtx} ctx 
 * @returns {Promise<void>}
 */
async function run(ctx) {
    const { sock, m, q, text, jid } = ctx
    if (!ctx.isOwner) return 
    try {
        let result = await eval(`${text}`)
        if (typeof (result) !== 'string') result = util.inspect(result)
        return await m.arashirep(result)
    } catch (e) {
        console.log(`eval`, e)
        return await m.arashirep(e.message)
    }
}

const plugin = { run }

plugin.name = "eval"
plugin.commands = ["!"]
plugin.categories = ["main"]
plugin.description = "eval biasa"

/**@type {pluginMeta} */
plugin.meta = {
    filename: "eval.js",
    author: "kado",
    note: "baru belajar bikin base",
    version: "1",
    path: "main"
}

/**@type {PluginConfig} */
plugin.config = {
    protected: true,
    bypassPrefix: true
}

export default plugin