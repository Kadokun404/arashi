import { allPaths } from "#core/all-paths.js"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const DB_PATH = allPaths.botNameDb

/**
 * bot-name-manager.js
 *
 * simpen daftar nama yang di-register lewat plugin name-manager.js (command
 * `name add <nama>`), sekaligus status lock per nama nya (`lock <nama>` /
 * `unlock <nama>`). ini KEPISAH dari global bot-lock (tools/bot-lock.js,
 * global.isBotLocked) -- global lock ngunci SEMUA command bot, sedangkan
 * lock per-nama di sini cuma nge-flag status "locked"/"unlocked" buat nama
 * yang udah di-daftarin (dipakai plugin name-manager.js buat balikin teks
 * "Bot Locked."/"Bot Unlocked.").
 */
class BotNameManager {
    /** @type {Set<string>} nama-nama yang udah di register (lowercase) */
    #names = new Set()

    /** @type {Map<string, boolean>} nama (lowercase) -> true kalau locked */
    #locked = new Map()

    /**
     * @param {string} name
     * @returns {string}
     */
    #normalize(name) {
        return (name || "").trim().toLowerCase()
    }

    /**
     * @param {string} name
     * @returns {{ok: boolean, message: string}}
     */
    add(name) {
        const key = this.#normalize(name)
        if (!key) return { ok: false, message: "nama gak boleh kosong" }
        if (this.#names.has(key)) return { ok: false, message: `nama *${key}* udah ke daftar` }
        this.#names.add(key)
        this.#save()
        return { ok: true, message: `nama *${key}* berhasil di tambahin` }
    }

    /**
     * @param {string} name
     * @returns {{ok: boolean, message: string}}
     */
    remove(name) {
        const key = this.#normalize(name)
        if (!this.#names.has(key)) return { ok: false, message: `nama *${key}* gak ke daftar` }
        this.#names.delete(key)
        this.#locked.delete(key)
        this.#save()
        return { ok: true, message: `nama *${key}* berhasil di hapus` }
    }

    /**
     * @param {string} name
     * @returns {boolean}
     */
    exists(name) {
        return this.#names.has(this.#normalize(name))
    }

    /**
     * @returns {string[]}
     */
    list() {
        return [...this.#names]
    }

    /**
     * @param {string} name
     * @returns {boolean}
     */
    isLocked(name) {
        return this.#locked.get(this.#normalize(name)) === true
    }

    /**
     * @param {string} name
     * @returns {{ok: boolean, message: string}}
     */
    lock(name) {
        const key = this.#normalize(name)
        if (!this.#names.has(key)) return { ok: false, message: `nama *${key}* belum ke daftar, pakai *name add ${key}* dulu` }
        this.#locked.set(key, true)
        this.#save()
        return { ok: true, message: "Bot Locked." }
    }

    /**
     * @param {string} name
     * @returns {{ok: boolean, message: string}}
     */
    unlock(name) {
        const key = this.#normalize(name)
        if (!this.#names.has(key)) return { ok: false, message: `nama *${key}* belum ke daftar, pakai *name add ${key}* dulu` }
        this.#locked.set(key, false)
        this.#save()
        return { ok: true, message: "Bot Unlocked." }
    }

    async #save() {
        const data = {
            names: [...this.#names],
            locked: Object.fromEntries(this.#locked)
        }
        await mkdir(dirname(DB_PATH), { recursive: true })
        await writeFile(DB_PATH, JSON.stringify(data, null, 2))
    }

    async load() {
        try {
            const raw = await readFile(DB_PATH, "utf-8")
            const parsed = JSON.parse(raw)
            this.#names = new Set(Array.isArray(parsed?.names) ? parsed.names : [])
            this.#locked = new Map(Object.entries(parsed?.locked ?? {}))
        } catch (e) {
            console.warn(`[bot-name-manager] gagal load db (${e.message}), pakai default (kosong)`)
            this.#names = new Set()
            this.#locked = new Map()
        }
    }
}

const botNameManager = new BotNameManager()
await botNameManager.load()

export { botNameManager }
