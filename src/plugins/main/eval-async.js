/**
 * @import {PluginCtx, PluginConfig, pluginMeta} from "../../types/types.js"
 */

import { sendRich } from "#helper/message/send-rich.js"
import util from 'node:util'
import crypto from 'node:crypto'
import fs from "node:fs"
import * as baileys from "baileys"

/**
 * @param {PluginCtx} ctx 
 * @returns {Promise <void>}
 */
async function run(ctx) {
    const { sock, m, q, text, jid } = ctx
    const mese = q || m

    try {
        let result = await eval(`(async () => { ${text} })()`)
        if (typeof (result) !== 'string') result = util.inspect(result)
        return await sock.sendMessage(jid, { text: result }, { quoted: mese })
    } catch (e) {
        console.log(e)
        return await sock.sendMessage(jid, { text: e.message }, { quoted: mese })

    }
}

const plugin = { run }

plugin.name = "eval async"
plugin.commands = ["!!"]
plugin.categories = ["main"]
plugin.description = "eval yang udah di bungkus oleh async function, jadi bisa pakai keyword await. ingat return ya!"

plugin.meta = {
    filename: "eval-async.js",
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