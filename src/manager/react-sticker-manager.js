import { allPaths } from "#root/src/all-paths.js"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const DB_PATH = allPaths.reactStickerDb

/** dipakai buat auto-generate data/react-sticker.json kalau filenya belum ada */
const DEFAULT_STICKERS = {
    default: [{
        url: "https://mmg.whatsapp.net/v/t62.15575-24/820542490_1485443583405284_8582587031754431832_n.enc?ccb=11-4&oh=01_Q5Aa5gG16ErEMs7Z5eKKjLQtls9-tjTlqUdHhGZdJUbdBdxuXA&oe=6AE0246B&_nc_sid=5e03e0&mms3=true",
        fileSha256: "TDCx7iQFfaxjqtd+sszsenahLeC/3upiT9Mr8oxlszw=",
        fileEncSha256: "CzVyjse/Mg3TUAecrzIUziHfRx3Q0djtqOU8H9IhasE=",
        mediaKey: "dpzwjhMtvwblQ0EsfpVK2YWlPLfOYByGPl9VW31svqA=",
        mimetype: "image/webp",
        height: 64,
        width: 64,
        directPath: "/v/t62.15575-24/820542490_1485443583405284_8582587031754431832_n.enc?ccb=11-4&oh=01_Q5Aa5gG16ErEMs7Z5eKKjLQtls9-tjTlqUdHhGZdJUbdBdxuXA&oe=6AE0246B&_nc_sid=5e03e0",
        fileLength: "14666",
        mediaKeyTimestamp: "1790439461",
        isAnimated: false,
        isAvatar: false,
        isAiSticker: false,
        isLottie: false
    }]
}

/**
 * react-sticker-manager.js
 *
 * simpen daftar stiker (statis, bukan animated) yang dipake plugin
 * tools/rstc.js buat "react-sticker" (spam sticker asosiasi ke pesan yang
 * di-reply). Disimpen per nama sebagai ARRAY, jadi satu nama bisa nampung
 * banyak stiker dan dipilih acak tiap nembak. Field-field byte
 * (fileSha256, fileEncSha256, mediaKey) disimpen base64, fileLength &
 * mediaKeyTimestamp disimpen string.
 *
 * @typedef {object} ReactStickerEntry
 * @property {string} url
 * @property {string} fileSha256 base64
 * @property {string} fileEncSha256 base64
 * @property {string} mediaKey base64
 * @property {string} mimetype
 * @property {number} height
 * @property {number} width
 * @property {string} directPath
 * @property {string} fileLength
 * @property {string} mediaKeyTimestamp
 * @property {boolean} isAnimated
 * @property {boolean} isAvatar
 * @property {boolean} isAiSticker
 * @property {boolean} isLottie
 */
class ReactStickerManager {
    /** @type {Map<string, ReactStickerEntry[]>} nama (lowercase) -> list stiker */
    #stickers = new Map()

    /**
     * @param {string} name
     * @returns {string}
     */
    #normalize(name) {
        return (name || "").trim().toLowerCase()
    }

    /**
     * nambah satu stiker ke daftar nama tertentu (gak nimpa yang lama)
     * @param {string} name
     * @param {ReactStickerEntry} entry
     * @returns {{ok: boolean, message: string}}
     */
    add(name, entry) {
        const key = this.#normalize(name) || "default"
        const list = this.#stickers.get(key) || []
        list.push(entry)
        this.#stickers.set(key, list)
        this.#save()
        return { ok: true, message: `stiker ke-${list.length} berhasil ditambahin ke *${key}*` }
    }

    /**
     * hapus satu nama sepenuhnya, atau satu index tertentu aja
     * @param {string} name
     * @param {number} [index] index dimulai dari 1, kalau gak dikasih maka hapus semua stiker di nama itu
     * @returns {{ok: boolean, message: string}}
     */
    remove(name, index) {
        const key = this.#normalize(name)
        const list = this.#stickers.get(key)
        if (!list || !list.length) return { ok: false, message: `stiker *${key}* gak ke daftar` }

        if (index === undefined) {
            this.#stickers.delete(key)
            this.#save()
            return { ok: true, message: `semua stiker (${list.length}) di *${key}* berhasil di hapus` }
        }

        if (isNaN(index) || index <= 0 || index > list.length) {
            return { ok: false, message: `index gak valid, *${key}* cuma punya ${list.length} stiker` }
        }

        list.splice(index - 1, 1)
        if (!list.length) this.#stickers.delete(key)
        this.#save()
        return { ok: true, message: `stiker ke-${index} di *${key}* berhasil di hapus (sisa ${list.length})` }
    }

    /**
     * ambil satu stiker acak dari nama tertentu
     * @param {string} name
     * @returns {ReactStickerEntry | undefined}
     */
    get(name) {
        const list = this.#stickers.get(this.#normalize(name))
        if (!list || !list.length) return undefined
        return list[Math.floor(Math.random() * list.length)]
    }

    /**
     * ambil semua stiker dari nama tertentu
     * @param {string} name
     * @returns {ReactStickerEntry[]}
     */
    getAll(name) {
        return this.#stickers.get(this.#normalize(name)) || []
    }

    /**
     * @param {string} name
     * @returns {boolean}
     */
    exists(name) {
        const list = this.#stickers.get(this.#normalize(name))
        return !!list && list.length > 0
    }

    /**
     * @returns {{name: string, count: number}[]}
     */
    list() {
        return [...this.#stickers.entries()].map(([name, list]) => ({ name, count: list.length }))
    }

    async #save() {
        const data = Object.fromEntries(this.#stickers)
        await mkdir(dirname(DB_PATH), { recursive: true })
        await writeFile(DB_PATH, JSON.stringify(data, null, 2))
    }

    async load() {
        try {
            const raw = await readFile(DB_PATH, "utf-8")
            const parsed = JSON.parse(raw)
            const entries = Object.entries(parsed && typeof parsed === "object" ? parsed : {})
            // dukung format lama (satu objek per nama), otomatis dibungkus jadi array
            this.#stickers = new Map(entries.map(([name, value]) => [name, Array.isArray(value) ? value : [value]]))
        } catch (e) {
            if (e.code === "ENOENT") {
                this.#stickers = new Map(Object.entries(DEFAULT_STICKERS))
                await this.#save()
                console.log(`[react-sticker-manager] data/react-sticker.json belum ada, auto-generate dengan stiker "default"`)
            } else {
                console.warn(`[react-sticker-manager] gagal load db (${e.message}), pakai default (kosong)`)
                this.#stickers = new Map()
            }
        }
    }
}

const reactStickerManager = new ReactStickerManager()
await reactStickerManager.load()

export { reactStickerManager }
