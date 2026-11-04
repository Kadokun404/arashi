import { JsonObjectDb } from "./json-db.js"
import { allPaths } from "#core/all-paths.js"

/**
 * @typedef {object} GroupWelcomeSettings
 * @property {boolean} enabled
 * @property {string|undefined} message pesan welcome, support placeholder {mention}, {name}, {group}, {count}
 * @property {string|undefined} background url background buat welcome card (opsional, fallback ke warna polos kalau kosong)
 * @property {number|undefined} autoDeleteSeconds kalau diisi, pesan welcome bakal ke-hapus otomatis setelah sekian detik (ala Karina). undefined/0 = gak di hapus
 */

/**
 * @typedef {object} GroupGoodbyeSettings
 * @property {boolean} enabled
 * @property {string|undefined} message pesan goodbye, support placeholder {mention}, {name}, {group}, {count}
 * @property {string|undefined} background
 */

/**
 * @typedef {object} GroupPromoteSettings
 * @property {boolean} enabled
 * @property {string|undefined} message pesan promote, support placeholder {mention}, {name}, {group}, {count}
 */

/**
 * @typedef {object} GroupDemoteSettings
 * @property {boolean} enabled
 * @property {string|undefined} message pesan demote, support placeholder {mention}, {name}, {group}, {count}
 */

/**
 * @typedef {object} GroupSettingsRecord
 * @property {GroupWelcomeSettings|undefined} welcome
 * @property {GroupGoodbyeSettings|undefined} goodbye
 * @property {GroupPromoteSettings|undefined} promote
 * @property {GroupDemoteSettings|undefined} demote
 */

/**
 * groupSettingsDb, json object based (data/group-settings.json), key nya jid grup,
 * value nya {welcome, goodbye}. dipisah dari chatManagerConfig soalnya ini per-fitur
 * (welcome/goodbye), bukan soal boleh/gaknya bot listen di grup itu
 */
const groupSettingsDb = new JsonObjectDb(allPaths.groupSettingsDb, {})
await groupSettingsDb.load()

export { groupSettingsDb }
