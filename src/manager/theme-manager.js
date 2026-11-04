import { config } from "#root/config.js"
import fs from "node:fs/promises"
import path from "node:path"
import { proto } from "baileys"

import { defaultLock } from "#root/src/async-lock.js"
import { allPaths } from "#root/src/all-paths.js"

const CONFIG_PATH = allPaths.themeConfig
const DEFAULT_KEY = `theme-manager` // key buat async lock
const HERE = `[theme-manager.js]` // buat log display

/**
 * @import {WAMessageContent} from "baileys"
 * @import {CommonResponse} from "../types/types.js"
 */

/**
 * @typedef {object} ThemeManagerData
 * @property {WAMessageContent|undefined} message pesan mentah (full WAMessageContent) yang di pake sebagai "tema" menu, kalau ke isi bakal override title/desc/url pas di render
 * @property {string} url
 * @property {string|undefined} title
 * @property {string|undefined} description
 */

/**
 * ThemeManager: pengganti sistem lama (menuDb/data/menu.json yang cuma nyimpen
 * title/desc/url/jpegThumbnail statis doang). di sini bisa nyimpen FULL raw
 * WAMessageContent (misal hasil capture dari owner-crm.js / message-builder.js,
 * atau hasil build thumbnail-link dari plugin theme.js), jadi tema menu bisa
 * se-flexible pesan WA aslinya (link preview asli, thumbnail asli, dsb),
 * gak cuma gambar statis.
 */
class ThemeManager {

    /**@type {ThemeManagerData} */
    #config = {}

    /**
     * @returns {ThemeManagerData}
     */
    getData() {
        return this.#config
    }

    /**
     * simpen full raw message (WAMessageContent) sebagai tema, biasanya di ambil
     * dari pesan yang di reply (contoh: hasil link preview asli WA) atau hasil
     * build manual (misal thumbnail-link dari plugin theme.js)
     * @param {WAMessageContent} message
     * @returns {Promise<CommonResponse<string>>}
     */
    async setMessage(message) {
        this.#config.message = message
        await this.#saveConfig()
        return {
            data: `tema (raw message) berhasil di perbarui`
        }
    }

    /**
     * simpen favicon (icon kecil di sebelah domain pas link preview) sebagai bagian
     * dari extendedTextMessage.faviconMMSMetadata. di-merge ke message yang udah ada
     * (bukan overwrite total) biar thumbnail besar yang udah di set sebelumnya
     * (lewat set-thumb) gak ke ilang, begitu juga sebaliknya
     * @param {object|undefined} faviconMeta bentuknya {thumbnailDirectPath, thumbnailSha256, thumbnailEncSha256, mediaKey, mediaKeyTimestamp, thumbnailHeight, thumbnailWidth}, atau undefined buat hapus favicon
     * @returns {Promise<CommonResponse<string>>}
     */
    async setFavicon(faviconMeta) {
        try {
            const existingExtendedText = this.#config.message?.extendedTextMessage || {}

            const message_obj = {
                extendedTextMessage: {
                    ...existingExtendedText,
                    faviconMMSMetadata: faviconMeta || null
                }
            }

            this.#config.message = proto.Message.fromObject(message_obj)
            await this.#saveConfig()
            return {
                data: faviconMeta ? `favicon berhasil di set` : `favicon berhasil di hapus`
            }
        } catch (e) {
            console.error(e)
            return { error: `catch error ${e.message}` }
        }
    }

    /**
     * @param {string|undefined} url
     * @returns {Promise<CommonResponse<string>>}
     */
    async setUrl(url) {
        try {
            const validUrl = /^\s*https?:\/\//.test(url)
            if (!validUrl) return { error: `url harus string dan pastikan benar` }
            const urlTrim = url.trim()
            if (this.#config?.url === urlTrim) return { error: `url sama dengan sebelumnya. nothing changes` }
            this.#config.url = urlTrim
            await this.#saveConfig()
            return { data: `sip coba test menunya` }
        } catch (e) {
            console.error(e)
            return { error: `catch error ${e.message}` }
        }
    }

    /**
     * @param {string|undefined} title
     * @returns {Promise<CommonResponse<string>>}
     */
    async setTitle(title) {
        try {
            const titleType = typeof (title)

            const stringOrUndefined = titleType === "string" || titleType === "undefined"
            if (!stringOrUndefined) return { error: `param harus tipe string. ${titleType} diterima` }

            const isDescEmptyAndTitleEmpty = !this.#config.description && !title
            if (isDescEmptyAndTitleEmpty) return { error: `kamu gak bisa punya title kosong kalau deskripsi nya juga kosong.` }

            const isTitleEmpty = titleType === "undefined" || !title
            if (this.#config?.title === undefined && isTitleEmpty) return { error: `title sudah kosong. nothing changes` }

            const isTitleSame = this.#config.title === title
            if (isTitleSame) return { error: `title sama. nothing changes` }

            this.#config.title = title || undefined
            await this.#saveConfig()
            return { data: title ? `title berhasil di set menjadi ${title}` : `title berhasil di hapus` }

        } catch (e) {
            console.error(e)
            return { error: `catch error ${e.message}` }
        }
    }

    /**
     * @param {string|undefined} description
     * @returns {Promise<CommonResponse<string>>}
     */
    async setDescription(description) {
        try {
            const titleType = typeof (description)

            const stringOrUndefined = titleType === "string" || titleType === "undefined"
            if (!stringOrUndefined) return { error: `param harus tipe string. ${titleType} diterima` }

            const isTitleEmptyAndDescEmpty = !this.#config.title && !description
            if (isTitleEmptyAndDescEmpty) return { error: `kamu gak bisa punya description kosong kalau title nya juga kosong.` }

            const isDescriptionEmpty = titleType === "undefined" || !description
            if (this.#config?.description === undefined && isDescriptionEmpty) return { error: `description sudah kosong. nothing changes` }

            const isDescriptionSame = this.#config.description === description
            if (isDescriptionSame) return { error: `deskripsi sama. nothing changes` }

            this.#config.description = description || undefined
            await this.#saveConfig()
            return { data: description ? `description berhasil di set menjadi ${description}` : `description berhasil di hapus` }

        } catch (e) {
            console.error(e)
            return { error: `catch error ${e.message}` }
        }
    }

    /**
     * @returns {ThemeManagerData}
     */
    #getDefaultConfig() {
        return {
            description: `${config.botName}`,
            message: undefined,
            title: `${config.menuTitle}`,
            url: `${config.menuUrl}`
        }
    }

    async #saveConfig() {
        return await defaultLock.withLock(`${DEFAULT_KEY}:save`, async () => {
            const destinationDir = path.dirname(CONFIG_PATH)
            await fs.mkdir(destinationDir, { recursive: true })
            await fs.writeFile(CONFIG_PATH, JSON.stringify(this.#config, null, 2))
            console.log(`${HERE} write file ${CONFIG_PATH}`)
        })
    }

    async #loadConfig() {
        return await defaultLock.withLock(`${DEFAULT_KEY}:load`, async () => {
            try {
                const file = await fs.readFile(CONFIG_PATH, { encoding: 'utf-8' })
                /**@type{ThemeManagerData} */
                const json = JSON.parse(file)
                this.#config = {
                    description: json.description,
                    title: json.title,
                    url: json.url,
                    message: json.message ? proto.Message.fromObject(json.message) : undefined
                }
                console.log(`${HERE} load theme manager config`)
            } catch (e) {
                if (e.code === "ENOENT") {
                    console.log(`${HERE} no config found, pakai default config`)
                    this.#config = this.#getDefaultConfig()
                    await this.#saveConfig()
                } else {
                    console.error(`${HERE} unknown error ${e.message}\nreplace old config with default config`, e)
                    this.#config = this.#getDefaultConfig()
                    await this.#saveConfig()
                }
            }
        })
    }

    async init() {
        await this.#loadConfig()
    }

    /**
     * @param {ThemeManagerData} json
     */
    async useExternalJson(json) {
        this.#config = json
        await this.#saveConfig()
    }
}

const themeManager = new ThemeManager()
await themeManager.init()

export { themeManager }
