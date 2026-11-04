import { JsonDb } from "./json-db.js"
import { allPaths } from "#root/src/all-paths.js"

/**
 * @typedef {object} DisabledCommandRecord
 * @property {string} command command yang di disable, contoh "shell" / "$"
 * @property {{lid: string|undefined, pn: string|undefined}} disabledBy siapa yang matiin
 * @property {string} disabledAt tanggal di disable, format dd-mm-yyyy
 */

const pluginEnabledDb = new JsonDb(allPaths.pluginEnabledDb, [])
await pluginEnabledDb.load()

export { pluginEnabledDb }
