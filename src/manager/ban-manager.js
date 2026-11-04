import fs from "fs"
import path from "path"
import { allPaths } from "#root/src/all-paths.js"
import { ownerManager } from "#manager/owner-manager.js"

const FILE = allPaths.banDb || path.join(process.cwd(), "data", "ban.json")
fs.mkdirSync(path.dirname(FILE), { recursive: true })

/**
 * @typedef {object} BanRecord
 * @property {string|undefined} lid
 * @property {string|undefined} pn
 * @property {string|undefined} name
 * @property {number} bannedAt
 * @property {string|undefined} bannedBy
 * @property {number|null} expiresAt null atau 0 = permanen
 * @property {string|undefined} reason
 */

/** @type {Map<string, BanRecord>} */
const banMap = new Map()

const load = () => {
    try {
        const raw = JSON.parse(fs.readFileSync(FILE, "utf8"))
        if (Array.isArray(raw)) {
            for (const item of raw) {
                const key = item.lid || item.pn
                if (key) banMap.set(key, item)
            }
        }
    } catch {
        // empty
    }
}

const save = () => {
    try {
        const list = Array.from(banMap.values())
        fs.writeFileSync(FILE, JSON.stringify(list, null, 2))
    } catch (e) {
        console.error("[ban-manager] failed to save data", e)
    }
}

load()

class BanManager {
    /**
     * membersihkan ban yang sudah kadaluarsa
     */
    sweepExpired() {
        const now = Date.now()
        let changed = false
        for (const [key, record] of banMap.entries()) {
            if (record.expiresAt && now > record.expiresAt) {
                banMap.delete(key)
                changed = true
            }
        }
        if (changed) save()
    }

    /**
     * cek apakah suatu contact sedang dalam status ban
     * @param {import("#types/types.js").contactCache | string | undefined} contact
     * @returns {boolean}
     */
    isBanned(contact) {
        if (!contact) return false

        const lid = typeof contact === "string" ? (contact.endsWith("@lid") ? contact : undefined) : contact.lid
        const pn = typeof contact === "string" ? (contact.endsWith("@s.whatsapp.net") ? contact : undefined) : contact.pn

        const now = Date.now()
        const checkEntry = (key) => {
            if (!key) return null
            const record = banMap.get(key)
            if (!record) return null
            if (record.expiresAt && now > record.expiresAt) {
                banMap.delete(key)
                save()
                return null
            }
            return record
        }

        const found = checkEntry(lid) || checkEntry(pn)
        if (found) return true

        // fallback cek value jika key nya beda
        for (const [key, record] of banMap.entries()) {
            if ((lid && record.lid === lid) || (pn && record.pn === pn)) {
                if (record.expiresAt && now > record.expiresAt) {
                    banMap.delete(key)
                    save()
                    return false
                }
                return true
            }
        }

        return false
    }

    /**
     * ambil informasi ban contact
     * @param {import("#types/types.js").contactCache | string | undefined} contact
     * @returns {BanRecord | undefined}
     */
    getBanInfo(contact) {
        if (!contact) return undefined
        const lid = typeof contact === "string" ? (contact.endsWith("@lid") ? contact : undefined) : contact.lid
        const pn = typeof contact === "string" ? (contact.endsWith("@s.whatsapp.net") ? contact : undefined) : contact.pn

        const now = Date.now()
        for (const [key, record] of banMap.entries()) {
            if ((lid && record.lid === lid) || (pn && record.pn === pn) || key === lid || key === pn) {
                if (record.expiresAt && now > record.expiresAt) {
                    banMap.delete(key)
                    save()
                    return undefined
                }
                return record
            }
        }
        return undefined
    }

    /**
     * ban user
     * @param {{lid?: string, pn?: string, name?: string}} target
     * @param {{durationMs?: number|null, reason?: string, bannedBy?: string}} [opts]
     * @returns {{ok: boolean, message: string, record?: BanRecord}}
     */
    ban(target, opts = {}) {
        const { lid, pn, name } = target || {}
        if (!lid && !pn) {
            return { ok: false, message: "target user tidak valid." }
        }

        // Jangan biarkan mem-ban owner / developer bot
        if (ownerManager.isOwner({ lid, pn })) {
            return { ok: false, message: "tidak bisa mem-ban owner atau developer bot." }
        }

        const { durationMs = null, reason = undefined, bannedBy = undefined } = opts
        const now = Date.now()
        const expiresAt = durationMs ? now + durationMs : null

        const record = {
            lid,
            pn,
            name: name || undefined,
            bannedAt: now,
            bannedBy,
            expiresAt,
            reason: reason || undefined
        }

        const key = lid || pn
        banMap.set(key, record)
        save()

        return { ok: true, message: "user berhasil di-ban.", record }
    }

    /**
     * unban user
     * @param {{lid?: string, pn?: string}} target
     * @returns {{ok: boolean, message: string, record?: BanRecord}}
     */
    unban(target) {
        const { lid, pn } = target || {}
        if (!lid && !pn) {
            return { ok: false, message: "target user tidak valid." }
        }

        let removed = null
        for (const [key, record] of banMap.entries()) {
            if ((lid && record.lid === lid) || (pn && record.pn === pn) || key === lid || key === pn) {
                removed = record
                banMap.delete(key)
                break
            }
        }

        if (removed) {
            save()
            return { ok: true, message: "user berhasil di-unban.", record: removed }
        }

        return { ok: false, message: "user tidak ditemukan di daftar ban." }
    }

    /**
     * daftar user yang diban
     * @returns {BanRecord[]}
     */
    listBanned() {
        this.sweepExpired()
        return Array.from(banMap.values())
    }

    /**
     * format sisa waktu dalam string bahasa manusia
     * @param {number|null} expiresAt
     * @returns {string}
     */
    formatRemaining(expiresAt) {
        if (!expiresAt) return "Permanen"
        const diff = expiresAt - Date.now()
        if (diff <= 0) return "Kadaluarsa"

        const seconds = Math.floor((diff / 1000) % 60)
        const minutes = Math.floor((diff / (1000 * 60)) % 60)
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
        const days = Math.floor(diff / (1000 * 60 * 60 * 24))

        const parts = []
        if (days > 0) parts.push(`${days} hari`)
        if (hours > 0) parts.push(`${hours} jam`)
        if (minutes > 0) parts.push(`${minutes} menit`)
        if (seconds > 0 && days === 0) parts.push(`${seconds} detik`)

        return parts.join(" ") || "kurang dari 1 detik"
    }
}

export const banManager = new BanManager()
