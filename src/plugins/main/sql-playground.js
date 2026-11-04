/**
 * @import {PluginCtx, Plugin} from "../../types/types.js"
 */

import util from "node:util"
import { db } from "#database/database.js"
import { toJsObject } from "#helper/common.js"

/**
 * @param {PluginCtx} ctx 
 * @returns {Promise<any>}
 */
async function run(ctx) {
    const { m, text } = ctx
    const sqlQuery = text??''.trim()

    if (!sqlQuery) return await m.arashirep(`mana query sql nya bro?`)

    try {
        const dbResult = db.prepare(sqlQuery).get()
        const result = util.inspect(toJsObject(dbResult)) 
        m.arashirep(result)
    } catch (e) {
        m.arashirep(`fail\n${e.message}`)
    }
}

/**@type {Plugin} */
const plugin = { run }

plugin.name = "sql playground"
plugin.commands = ["sql"]
plugin.categories = ["main"]
plugin.description = "type any sql query and get result. plugin masih beta, return nya pakai .get() "

plugin.meta = {
    filename: "sql-playground.js",
    author: "kado",
    note: "hati hati lu jangan delete data sendiri :v",
    version: "1",
    path: "main"
}

plugin.config = {
    protected: true,
    bypassPrefix: true
}

export default plugin