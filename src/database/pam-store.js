import { JsonDb } from "./json-db.js"
import { allPaths } from "#root/src/all-paths.js"

/**
 * @typedef {object} PamRecord
 * @property {string} lid target yang di kasih akses, format 123@lid
 * @property {string|undefined} pn nomor hp target (kalau ketauan)
 * @property {string|undefined} name nama target pas di grant
 * @property {string} command nama command plugin yang di akses in
 * @property {{lid: string|undefined, pn: string|undefined}} grantedBy siapa yang ngasih akses
 * @property {string} grantedAt tanggal di grant, format dd-mm-yyyy
 */

const pamDb = new JsonDb(allPaths.pamDb, [])
await pamDb.load()

export { pamDb }
