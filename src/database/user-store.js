import { JsonDb } from "./json-db.js"
import { allPaths } from "#root/src/all-paths.js"

/**
 * @typedef {object} UserRecord
 * @property {string} lid
 * @property {string|undefined} pn
 * @property {string} name nama yang di isi pas register
 * @property {number} age umur yang di isi pas register
 * @property {number} registeredAt unix timestamp (ms) pas register
 * @property {number} exp pengalaman, di-porting konsepnya dari Karina (opsional dipakai plugin lain)
 * @property {number} level
 */

const userDb = new JsonDb(allPaths.userDb, [])
await userDb.load()

export { userDb }
