import { allPaths } from "#core/all-paths.js"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const CONFIG_PATH = allPaths.antilinkConfig

// link whatsapp doang (chat.whatsapp.com / whatsapp.com), ini yang jadi target
// deteksi buat mode "wa" (antilink biasa), dan yang di-bypass di mode "all -wa"
// (2 versi: non-global buat .test() sekali pas, global khusus buat .replace()/matchAll,
// biar gak ada isu shared lastIndex antar-panggilan gara-gara flag "g")
const WA_LINK_REGEX = /(chat\.whatsapp\.com|(?:www\.)?whatsapp\.com)\/[^\s]*/i
const WA_LINK_REGEX_GLOBAL = /(chat\.whatsapp\.com|(?:www\.)?whatsapp\.com)\/[^\s]*/gi

// link apapun (http/https/www), dipake buat mode "all" (antilinkall)
const ANY_LINK_REGEX = /(https?:\/\/|www\.)[^\s]+/i
const ANY_LINK_REGEX_GLOBAL = /(https?:\/\/|www\.)[^\s]+/gi

/**
 * @typedef {"wa"|"all"} AntilinkKind
 */

/**
 * @typedef {object} AntilinkGroupConfig
 * @property {boolean} enabled
 * @property {AntilinkKind} kind "wa" = antilink biasa (cuma link whatsapp), "all" = antilinkall (semua link)
 * @property {boolean} waBypass cuma relevan kalau kind "all": true = link whatsapp di-bypass (aman), false = ikut kehapus juga
 * @property {string[]} whitelist daftar url/domain yang di-bypass antilink (lolos), biar pun kind nya "wa" atau "all"
 */

/**
 * normalize satu entry url/domain whitelist: buang protokol (http/https),
 * buang "www.", buang trailing slash, lowercase semua -- biar matching nya
 * konsisten gak peduli user nulis "https://youtube.com/", "www.youtube.com",
 * atau "youtube.com" doang.
 * @param {string} raw
 * @returns {string}
 */
function normalizeWhitelistEntry(raw) {
    return (raw || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/+$/, "")
}

/**
 * antilink manager, sekarang ada 2 command/mode:
 *
 * - `antilink` (kind "wa", DEFAULT): cuma nge-detect & hapus link whatsapp
 *   (chat.whatsapp.com / whatsapp.com) doang. link jenis lain (youtube, tiktok,
 *   dll) dibiarin aja, gak kena.
 * - `antilinkall` (kind "all"): hapus literally semua jenis link. tambahin
 *   flag -wa pas nyalain (`antilinkall on -wa`) biar link whatsapp di-bypass
 *   (aman, gak ikut kehapus), tanpa -wa berarti link whatsapp juga ikut kena.
 *
 * kedua mode juga bisa di kasih WHITELIST per grup (`antilink set wl
 * url,url` / `antilinkall set wl url,url`) -- url/domain yang ada di
 * whitelist bakal LOLOS dari antilink, walaupun mode nya lagi nyala. admin
 * grup & owner selalu bypass total, gak peduli whitelist (di cek di luar
 * manager ini, di notify-handler.js).
 */
class AntilinkManager {
    /** @type {Map<string, AntilinkGroupConfig>} jid grup -> config */
    #groupConfig = new Map()

    /**
     * @param {string} jid
     * @returns {AntilinkGroupConfig}
     */
    getConfig(jid) {
        return this.#groupConfig.get(jid) ?? { enabled: false, kind: "wa", waBypass: false, whitelist: [] }
    }

    /**
     * @param {string} jid
     * @param {boolean} enabled
     * @param {AntilinkKind} [kind]
     * @param {{waBypass?: boolean}} [opts]
     * @returns {Promise<void>}
     */
    async setConfig(jid, enabled, kind = "wa", opts = {}) {
        if (!enabled) {
            this.#groupConfig.delete(jid)
        } else {
            const { waBypass = false } = opts
            // whitelist yang udah ke set sebelumnya (kalau ada) tetep di pertahanin
            // pas toggle on/off/ganti mode, biar gak ke reset tiap kali `on` dipanggil lagi
            const whitelist = this.#groupConfig.get(jid)?.whitelist ?? []
            this.#groupConfig.set(jid, { enabled: true, kind, waBypass, whitelist })
        }
        await this.#save()
    }

    /**
     * ganti daftar whitelist grup (REPLACE, bukan merge) -- dipake command
     * `antilink set wl url,url` / `antilinkall set wl url,url`
     * @param {string} jid
     * @param {string[]} urls
     * @returns {Promise<string[]>} whitelist final (udah dinormalize + dedupe)
     */
    async setWhitelist(jid, urls) {
        const normalized = [...new Set((urls || []).map(normalizeWhitelistEntry).filter(Boolean))]
        const current = this.getConfig(jid)
        this.#groupConfig.set(jid, { ...current, whitelist: normalized })
        await this.#save()
        return normalized
    }

    /**
     * @param {string} jid
     * @returns {string[]}
     */
    getWhitelist(jid) {
        return this.getConfig(jid).whitelist ?? []
    }

    /**
     * cek apakah 1 potongan link cocok sama salah satu entry whitelist grup ini
     * @param {string} jid
     * @param {string} link
     * @returns {boolean}
     */
    #isLinkWhitelisted(jid, link) {
        const whitelist = this.getWhitelist(jid)
        if (!whitelist.length) return false
        const normalizedLink = normalizeWhitelistEntry(link)
        return whitelist.some(entry => normalizedLink.startsWith(entry))
    }

    /**
     * cek apakah teks nya masih ngandung link non-whatsapp (dipake buat mode "all" + waBypass)
     * @param {string} jid
     * @param {string} text
     * @returns {boolean}
     */
    #hasNonWaLink(jid, text) {
        const stripped = text.replace(WA_LINK_REGEX_GLOBAL, " ")
        const matches = stripped.match(ANY_LINK_REGEX_GLOBAL) ?? []
        return matches.some(link => !this.#isLinkWhitelisted(jid, link))
    }

    /**
     * cek apakah teks ngelanggar antilink grup ini
     * @param {string} jid
     * @param {string|undefined} text
     * @returns {{violated: boolean}}
     */
    check(jid, text) {
        const config = this.getConfig(jid)
        if (!config.enabled || !text) return { violated: false }

        if (config.kind === "wa") {
            // mode default: cuma link whatsapp (chat.whatsapp.com/whatsapp.com) yang di deteksi & di hapus
            const matches = text.match(WA_LINK_REGEX_GLOBAL) ?? []
            const violated = matches.some(link => !this.#isLinkWhitelisted(jid, link))
            return { violated }
        }

        // mode "all": semua link kena, kecuali kalau waBypass nyala DAN semua link
        // yang ada di teks itu link whatsapp doang (gak ada link lain selain wa),
        // atau link nya masuk whitelist
        if (!ANY_LINK_REGEX.test(text)) return { violated: false }
        if (config.waBypass && !this.#hasNonWaLink(jid, text)) return { violated: false }

        const matches = text.match(ANY_LINK_REGEX_GLOBAL) ?? []
        const relevant = config.waBypass ? matches.filter(link => !WA_LINK_REGEX.test(link)) : matches
        const violated = relevant.some(link => !this.#isLinkWhitelisted(jid, link))

        return { violated }
    }

    async #save() {
        const data = Object.fromEntries(this.#groupConfig)
        await mkdir(dirname(CONFIG_PATH), { recursive: true })
        await writeFile(CONFIG_PATH, JSON.stringify(data, null, 2))
    }

    async load() {
        try {
            const raw = await readFile(CONFIG_PATH, "utf-8")
            const parsed = JSON.parse(raw)
            const isValidShape = parsed && typeof parsed === "object" && !Array.isArray(parsed)
            if (!isValidShape) throw new Error("format config gak valid")
            this.#groupConfig = new Map(
                Object.entries(parsed).map(([jid, cfg]) => {
                    const { warnMode, ...rest } = cfg || {}
                    return [
                        jid,
                        // backward compat: config lama gak punya field "kind" (dulu cuma 1 mode,
                        // perilakunya persis sama kaya "all" + waBypass true) & gak punya "whitelist"
                        { kind: "all", waBypass: true, whitelist: [], ...rest }
                    ]
                })
            )
        } catch (e) {
            console.warn(`[antilink-manager] gagal load config (${e.message}), pakai default (semua off)`)
            this.#groupConfig = new Map()
        }
    }
}

const antilinkManager = new AntilinkManager()
await antilinkManager.load()

export { antilinkManager }
