import { JsonDb } from "./json-db.js"
import { allPaths } from "#core/all-paths.js"

/**
 * @typedef {object} TrustRecord
 * @property {string} lid target yang di trust, format 123@lid
 * @property {string|undefined} pn nomor hp target (kalau ketauan)
 * @property {string|undefined} name nama target pas di trust
 * @property {{lid: string|undefined, pn: string|undefined}} addedBy siapa yang ngasih trust
 * @property {string} addedAt tanggal di trust, format dd-mm-yyyy
 * @property {string|undefined} note catatan bebas pas trust, contoh "menu ! !!"
 */

const trustDb = new JsonDb(allPaths.trustDb, [])
await trustDb.load()

export { trustDb }
