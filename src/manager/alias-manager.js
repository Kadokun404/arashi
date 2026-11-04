import { allPaths } from "#root/src/all-paths.js"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const CONFIG_PATH = allPaths.aliasConfig

// nama yang gak boleh dipake, biar gak nimpa global penting yang udah ada
const RESERVED_NAMES = new Set([
    "_", "global", "globalThis", "console", "process", "require", "module",
    "exports", "Buffer", "setTimeout", "setInterval", "setImmediate", "sock"
])

const VALID_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

/**
 * naro `sock` di variable global custom (misal global.isha = sock), biar bisa
 * dipake langsung di script lain (misal hasil relayMessage dari crm) tanpa
 * musti import/akses ctx.sock. daftar nama nya persist di json, di re-apply
 * otomatis ke sock yang baru tiap kali bot reconnect.
 */
class AliasManager {

    /** @type {Set<string>} */
    #names = new Set()

    async load() {
        try {
            const raw = await readFile(CONFIG_PATH, "utf-8")
            const parsed = JSON.parse(raw)
            if (!Array.isArray(parsed)) throw new Error("format gak valid")
            this.#names = new Set(parsed)
        } catch (e) {
            console.warn(`[alias-manager] gagal load config (${e.message}), pakai default`)
            this.#names = new Set()
            await this.#save()
        }
    }

    /**
     * validasi nama doang, gak nge-set apa-apa. dipake sebelum add()
     * @param {string} name
     * @returns {string|null} pesan error, null kalau valid
     */
    validate(name) {
        if (!name) return `nama nya mana?`
        if (!VALID_IDENTIFIER.test(name)) return `nama nya harus valid buat jadi variable js (huruf/angka/underscore, gak boleh diawali angka)`
        if (RESERVED_NAMES.has(name)) return `nama "${name}" itu reserved, gak boleh dipake`
        if (name in global && !this.#names.has(name)) return `nama "${name}" udah kepake sama sesuatu yang lain di global, pilih nama lain`
        return null
    }

    /**
     * @param {string} name
     * @param {import('baileys').WASocket} sock
     * @returns {Promise<{ok: boolean, message: string}>}
     */
    async add(name, sock) {
        const err = this.validate(name)
        if (err) return { ok: false, message: err }

        global[name] = sock
        this.#names.add(name)
        await this.#save()

        return { ok: true, message: `✅ alias *${name}* siap dipake, contoh: *${name}.sendMessage(jid, {...})*` }
    }

    /**
     * @param {string} name
     * @returns {Promise<{ok: boolean, message: string}>}
     */
    async delete(name) {
        if (!this.#names.has(name)) return { ok: false, message: `alias "${name}" gak ada` }

        delete global[name]
        this.#names.delete(name)
        await this.#save()

        return { ok: true, message: `✅ alias *${name}* di hapus` }
    }

    /**
     * @returns {string[]}
     */
    list() {
        return [...this.#names]
    }

    /**
     * di panggil abis sock (re)connect, biar semua alias yang udah pernah di add
     * otomatis nunjuk ke sock yang baru (sock lama gak valid lagi abis reconnect)
     * @param {import('baileys').WASocket} sock
     */
    reapplyAll(sock) {
        for (const name of this.#names) global[name] = sock
    }

    async #save() {
        await mkdir(dirname(CONFIG_PATH), { recursive: true })
        await writeFile(CONFIG_PATH, JSON.stringify([...this.#names], null, 2))
    }
}

const aliasManager = new AliasManager()
await aliasManager.load()

export { aliasManager }