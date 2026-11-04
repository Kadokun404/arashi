import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

/**
 * JsonDb, penyimpanan sederhana berbasis file .json
 * dipakai buat data yang gak perlu skema kaku kaya sqlite,
 * contoh: trust level & plugin access manager (pam)
 *
 * data selalu berupa array of object, ke save ke disk tiap ada perubahan
 * (write nya di lock biar gak race condition kalau kepanggil bareng)
 */
class JsonDb {
    /**
     * @param {string} filePath lokasi file .json
     * @param {Array<any>} defaultData data default kalau file belum ada / corrupt
     */
    constructor(filePath, defaultData = []) {
        this.filePath = filePath
        this.defaultData = defaultData
        /**@type {Array<any>} */
        this.data = structuredClone(defaultData)
        this.#writeLock = Promise.resolve()
    }

    #writeLock

    /**
     * load data dari file ke memory, kalau file gak ada / corrupt maka
     * fallback ke default data dan langsung di simpan ke file
     * @returns {Promise<Array<any>>}
     */
    async load() {
        try {
            const raw = await readFile(this.filePath, "utf-8")
            const parsed = JSON.parse(raw)
            this.data = Array.isArray(parsed) ? parsed : structuredClone(this.defaultData)
        } catch (e) {
            console.warn(`[json-db] gagal load ${this.filePath}, pakai default data`, e.message)
            this.data = structuredClone(this.defaultData)
            await this.save()
        }
        return this.data
    }

    /**
     * simpan data yang ada di memory ke file, di lock biar aman dari race condition
     * @returns {Promise<void>}
     */
    async save() {
        this.#writeLock = this.#writeLock.then(async () => {
            const dir = dirname(this.filePath)
            await mkdir(dir, { recursive: true })
            await writeFile(this.filePath, JSON.stringify(this.data, null, 2))
        })
        return this.#writeLock
    }

    /**
     * hapus semua data (dipakai buat fitur "nuke")
     * @returns {Promise<void>}
     */
    async clear() {
        this.data = structuredClone(this.defaultData)
        await this.save()
    }
}

/**
 * JsonObjectDb, sama kayak JsonDb tapi bentuk datanya object (bukan array),
 * cocok buat data yang di-key-in per id, contoh: settings per-grup
 * (data/group-settings.json -> { [groupJid]: {...} })
 */
class JsonObjectDb {
    /**
     * @param {string} filePath lokasi file .json
     * @param {object} defaultData data default kalau file belum ada / corrupt
     */
    constructor(filePath, defaultData = {}) {
        this.filePath = filePath
        this.defaultData = defaultData
        /**@type {object} */
        this.data = structuredClone(defaultData)
        this.#writeLock = Promise.resolve()
    }

    #writeLock

    async load() {
        try {
            const raw = await readFile(this.filePath, "utf-8")
            const parsed = JSON.parse(raw)
            this.data = (parsed && typeof parsed === "object" && !Array.isArray(parsed))
                ? parsed
                : structuredClone(this.defaultData)
        } catch (e) {
            console.warn(`[json-db] gagal load ${this.filePath}, pakai default data`, e.message)
            this.data = structuredClone(this.defaultData)
            await this.save()
        }
        return this.data
    }

    async save() {
        this.#writeLock = this.#writeLock.then(async () => {
            const dir = dirname(this.filePath)
            await mkdir(dir, { recursive: true })
            await writeFile(this.filePath, JSON.stringify(this.data, null, 2))
        })
        return this.#writeLock
    }

    async clear() {
        this.data = structuredClone(this.defaultData)
        await this.save()
    }
}

export { JsonDb, JsonObjectDb }
