/**
 * @import {CommonResponse, PrefixResult, PrefixStatus} from "../types/types.js"
 */

import { readFile } from "node:fs/promises"
import { writeJsonAtomic } from "#core/utils.js"
import { existsSync } from "node:fs"
import path, { dirname } from "node:path"

import { pluginManager } from "./plugin-manager.js"
import { allPaths } from "#core/all-paths.js"

const PREFIX_CONFIG_PATH = allPaths?.prefix || path.resolve("data/prefix-config.json")
const GROUP_PREFIX_PATH = allPaths?.groupPrefix || path.resolve("data/group-prefix.json")
if (allPaths && !allPaths.groupPrefix) {
    allPaths.groupPrefix = GROUP_PREFIX_PATH
}

const string = {
    SUCCESS_OFF: `prefix disabled`,
    SUCCESS_ON: `prefix enabled`,
    NOTHING_CHANGE_OFF: `prefix already disabled`,
    NOTHING_CHANGE_ON: `prefix already enabled`
}

const DEFAULT_PREFIX_FLAG = false
const DEFAULT_PREFIX_LIST = [".", "#", "/"]

/**@returns {CommonResponse} */
const failResponse = message => ({ ok: false, message })

/**@returns {CommonResponse} */
const successResponse = message => ({ ok: true, message })

class PrefixManager {
    /**@type {boolean} */
    #isPrefixActive = DEFAULT_PREFIX_FLAG

    /**@type {string[]} */
    #prefixList = DEFAULT_PREFIX_LIST

    /**@type {Map<string, { isPrefixActive: boolean, prefixList: string[] }>} */
    #groupMap = new Map()

    /**
     * mengembalikan status prefix (jika ada jid grup, kembalikan status grup atau fallback global)
     * @param {string} [jid]
     * @returns {PrefixStatus & { isCustom?: boolean, isGroup?: boolean }}
     */
    getStatus(jid) {
        if (jid && this.#groupMap.has(jid)) {
            const conf = this.#groupMap.get(jid)
            return {
                isPrefixActive: conf.isPrefixActive,
                prefixList: Object.freeze([...conf.prefixList]),
                isCustom: true,
                isGroup: true
            }
        }
        return {
            isPrefixActive: this.#isPrefixActive,
            prefixList: Object.freeze([...this.#prefixList]),
            isCustom: false,
            isGroup: Boolean(jid?.endsWith("@g.us"))
        }
    }

    /**
     * Mengambil seluruh daftar grup yang memiliki override prefix (dari JSONL)
     */
    getAllGroupOverrides() {
        const list = []
        for (const [jid, conf] of this.#groupMap.entries()) {
            list.push({ jid, ...conf })
        }
        return list
    }

    /**
     * Aktifkan prefix untuk grup tertentu
     * @param {string} jid
     */
    async setGroupPrefixOn(jid) {
        if (!jid) return failResponse("invalid group jid")
        const prev = this.#groupMap.get(jid) || { prefixList: [...this.#prefixList] }
        this.#groupMap.set(jid, {
            isPrefixActive: true,
            prefixList: prev.prefixList
        })
        await this.saveGroupConfig()
        return successResponse(`prefix enabled for this group`)
    }

    async setGroupPrefixOff(jid) {
        if (!jid) return failResponse("invalid group jid")
        const prev = this.#groupMap.get(jid) || { prefixList: [...this.#prefixList] }
        this.#groupMap.set(jid, {
            isPrefixActive: false,
            prefixList: prev.prefixList
        })
        await this.saveGroupConfig()
        return successResponse(`prefix disabled for this group`)
    }

    async setGroupPrefixList(jid, prefixList) {
        if (!jid) return failResponse("invalid group jid")
        if (!Array.isArray(prefixList) || !prefixList.length) return failResponse("prefix list cannot be empty")
        const prev = this.#groupMap.get(jid) || { isPrefixActive: true }
        this.#groupMap.set(jid, {
            isPrefixActive: prev.isPrefixActive,
            prefixList
        })
        await this.saveGroupConfig()
        return successResponse(`prefix set to [ ${prefixList.join(" , ")} ]`)
    }

    async resetGroupPrefix(jid) {
        if (!jid) return failResponse("invalid group jid")
        if (!this.#groupMap.has(jid)) {
            return failResponse("group is already using global default")
        }
        this.#groupMap.delete(jid)
        await this.saveGroupConfig()
        return successResponse(`prefix reset to global default`)
    }

    async addPrefix(text) {
        if (!text || typeof text !== "string") return failResponse("invalid input string")

        const prefixExist = this.#prefixList.some(prefix => prefix === text)
        if (prefixExist) return failResponse(`prefix ${text} already exists`)

        const plugin = pluginManager.getPlugin(text)
        if (plugin?.config?.bypassPrefix) {
            return failResponse(`prefix ${text} reserved for *${plugin.name}*`)
        }

        this.#prefixList.push(text.trim())
        await this.saveConfig()
        return successResponse(`prefix ${text} added`)
    }

    getDefaultConfig() {
        return {
            isPrefixActive: DEFAULT_PREFIX_FLAG,
            prefixList: [...DEFAULT_PREFIX_LIST]
        }
    }

    /**
     * Resolve prefix dari teks pesan (memperhitungkan override per-grup jika ada jid)
     * @param {string|undefined} text 
     * @param {string} [jid] 
     * @returns {PrefixResult}
     */
    resolvePrefix(text, jid) {
        if (!text) return {
            ok: false,
            prefix: undefined,
            data: undefined
        }

        const groupConf = (jid && this.#groupMap.has(jid)) ? this.#groupMap.get(jid) : null
        const isActive = groupConf ? groupConf.isPrefixActive : this.#isPrefixActive
        const prefixList = groupConf ? groupConf.prefixList : this.#prefixList

        if (isActive) {
            for (const prefix of prefixList) {
                if (text.startsWith(prefix)) {
                    const textWithoutPrefix = text.slice(prefix.length).trimStart()
                    return {
                        ok: true,
                        prefix,
                        data: textWithoutPrefix
                    }
                }
            }

            return {
                ok: false,
                prefix: undefined,
                data: text
            }
        } else {
            // Mode Prefix OFF: cek apakah diawali salah satu prefix terdaftar
            for (const prefix of prefixList) {
                if (text.startsWith(prefix)) {
                    const textWithoutPrefix = text.slice(prefix.length).trimStart()
                    return {
                        ok: true,
                        prefix,
                        data: textWithoutPrefix
                    }
                }
            }

            return {
                ok: true,
                prefix: undefined,
                data: text
            }
        }
    }

    async togglePrefixOn() {
        if (this.#isPrefixActive) {
            return failResponse(string.NOTHING_CHANGE_ON)
        }
        this.#isPrefixActive = true
        await this.saveConfig()
        return successResponse(string.SUCCESS_ON)
    }

    async togglePrefixOff() {
        if (!this.#isPrefixActive) {
            return failResponse(string.NOTHING_CHANGE_OFF)
        }
        this.#isPrefixActive = false
        await this.saveConfig()
        return successResponse(string.SUCCESS_OFF)
    }

    async saveConfig() {
        const data = {
            isPrefixActive: this.#isPrefixActive,
            prefixList: this.#prefixList
        }
        await writeJsonAtomic(PREFIX_CONFIG_PATH, data)
        console.log(`[prefix config saved] ${PREFIX_CONFIG_PATH}`)
    }

    async saveGroupConfig() {
        const targetPath = GROUP_PREFIX_PATH || path.resolve("data/group-prefix.json")
        const data = {}
        for (const [jid, conf] of this.#groupMap.entries()) {
            data[jid] = {
                isPrefixActive: conf.isPrefixActive,
                prefixList: conf.prefixList
            }
        }
        await writeJsonAtomic(targetPath, data)
        console.log(`[group-prefix json saved] ${targetPath} (${this.#groupMap.size} records)`)
    }

    async loadConfig() {
        try {
            const file = await readFile(PREFIX_CONFIG_PATH, "utf-8")
            const config = JSON.parse(file)
            const fallback = this.getDefaultConfig()

            this.#isPrefixActive = typeof config.isPrefixActive === "boolean"
                ? config.isPrefixActive
                : fallback.isPrefixActive

            this.#prefixList = Array.isArray(config.prefixList)
                ? config.prefixList
                : fallback.prefixList

            console.log(`success read prefix config`)
        } catch (e) {
            console.warn(`fail load prefix config, using fallback config`, e)
            const fallback = this.getDefaultConfig()
            this.#isPrefixActive = fallback.isPrefixActive
            this.#prefixList = fallback.prefixList
            await this.saveConfig()
        }

        await this.loadGroupConfig()
    }

    async loadGroupConfig() {
        try {
            const targetPath = GROUP_PREFIX_PATH || path.resolve("data/group-prefix.json")
            const legacyPath = targetPath.endsWith(".json") ? targetPath.replace(/\.json$/, ".jsonl") : null

            let rawContent = ""
            if (existsSync(targetPath)) {
                rawContent = await readFile(targetPath, "utf-8")
            } else if (legacyPath && existsSync(legacyPath)) {
                // Auto-migrasi dari file .jsonl lama ke .json
                rawContent = await readFile(legacyPath, "utf-8")
                const lines = rawContent.split(/\r?\n/).filter(line => line.trim())
                this.#groupMap.clear()
                for (const line of lines) {
                    try {
                        const item = JSON.parse(line)
                        if (item?.jid && typeof item.isPrefixActive === "boolean") {
                            this.#groupMap.set(item.jid, {
                                isPrefixActive: item.isPrefixActive,
                                prefixList: Array.isArray(item.prefixList) && item.prefixList.length ? item.prefixList : [...this.#prefixList]
                            })
                        }
                    } catch {}
                }
                await this.saveGroupConfig()
                try {
                    const fs = await import("node:fs/promises")
                    await fs.unlink(legacyPath)
                } catch {}
                console.log(`[group-prefix] migrated ${this.#groupMap.size} records from jsonl to json`)
                return
            } else {
                return
            }

            if (!rawContent.trim()) return
            const parsed = JSON.parse(rawContent)
            this.#groupMap.clear()

            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    if (item?.jid && typeof item.isPrefixActive === "boolean") {
                        this.#groupMap.set(item.jid, {
                            isPrefixActive: item.isPrefixActive,
                            prefixList: Array.isArray(item.prefixList) && item.prefixList.length ? item.prefixList : [...this.#prefixList]
                        })
                    }
                }
            } else if (typeof parsed === "object" && parsed !== null) {
                for (const [jid, item] of Object.entries(parsed)) {
                    if (jid && typeof item?.isPrefixActive === "boolean") {
                        this.#groupMap.set(jid, {
                            isPrefixActive: item.isPrefixActive,
                            prefixList: Array.isArray(item.prefixList) && item.prefixList.length ? item.prefixList : [...this.#prefixList]
                        })
                    }
                }
            }
            console.log(`[group-prefix] loaded ${this.#groupMap.size} overrides from json`)
        } catch (e) {
            console.warn(`[group-prefix] fail load group prefix json`, e)
        }
    }

    async setToDefaultPrefixList() {
        this.#prefixList = this.getDefaultConfig().prefixList
        await this.saveConfig()
        return successResponse(`prefix reset to default`)
    }

    async deletePrefix(index) {
        if (!index || isNaN(index) || index <= 0) return failResponse("invalid index")
        if (index > this.#prefixList.length) return failResponse(`index exceeds max (${this.#prefixList.length})`)
        if (this.#prefixList.length <= 1) return failResponse(`cannot delete last prefix`)

        const elementRemoved = this.#prefixList.splice(index - 1, 1)
        await this.saveConfig()
        return successResponse(`prefix ${elementRemoved} deleted`)
    }
}

const prefixManager = new PrefixManager()
prefixManager.loadConfig()
export { prefixManager }
