import { groupSettingsDb } from "#database/group-settings-store.js"

/**
 * @typedef {object} WelcomeActionResponse
 * @property {boolean} ok
 * @property {string} message
 */

/**@param {string} message @returns {WelcomeActionResponse} */
const fail = (message) => ({ ok: false, message })

/**@param {string} message @returns {WelcomeActionResponse} */
const success = (message) => ({ ok: true, message })

const DEFAULT_WELCOME_MESSAGE = `welcome {mention} to {group}. you are member #{count}.`
const DEFAULT_GOODBYE_MESSAGE = `goodbye {mention}.`
const DEFAULT_PROMOTE_MESSAGE = `congratulations {mention}, you are now an admin in {group}.`
const DEFAULT_DEMOTE_MESSAGE = `{mention} is no longer an admin in {group}.`

// ala Karina: pesan welcome auto ke-hapus abis 30 detik biar chat gak numpuk,
// 0/false lewat setwelcome autodelete off buat matiin
const DEFAULT_WELCOME_AUTO_DELETE_SECONDS = 30

/**
 * ganti placeholder {mention}/{name}/{group}/{count} di template pesan welcome/goodbye
 * @param {string} template
 * @param {{name: string, group: string, count: number, lid: string}} data
 * @returns {string}
 */
function applyPlaceholder(template, data) {
    const rawTarget = data.mentionJid || data.pn || data.lid || ""
    const targetStr = typeof rawTarget === "string" ? rawTarget : (rawTarget?.id || rawTarget?.phoneNumber || "")
    const mentionNum = targetStr.split("@")[0] || ""
    return template
        .replaceAll("{mention}", mentionNum ? `@${mentionNum}` : (data.name || "member"))
        .replaceAll("{name}", data.name || "member")
        .replaceAll("{group}", data.group || "")
        .replaceAll("{count}", String(data.count ?? ""))
}

/**
 * GroupWelcomeManager: ngatur setting welcome/goodbye per-grup (data/group-settings.json,
 * lewat JsonObjectDb key = jid grup). Pola nya mirip chat-manager (per-grup config),
 * cuma disini keyed by JsonObjectDb bukan Map manual, soalnya udah ada helper nya.
 */
class GroupWelcomeManager {

    /**
     * @param {string} jid
     * @returns {GroupSettingsRecord}
     */
    #getRecord(jid) {
        return groupSettingsDb.data[jid] || {}
    }

    /**
     * @param {string} jid
     */
    getWelcomeSettings(jid) {
        return this.#getRecord(jid).welcome
    }

    /**
     * @param {string} jid
     */
    getGoodbyeSettings(jid) {
        return this.#getRecord(jid).goodbye
    }

    /**
     * @param {string} jid
     */
    getPromoteSettings(jid) {
        return this.#getRecord(jid).promote
    }

    /**
     * @param {string} jid
     */
    getDemoteSettings(jid) {
        return this.#getRecord(jid).demote
    }

    /**
     * berapa detik sebelum pesan welcome di auto-hapus (ala Karina). belum pernah
     * di set = default 30 detik nyala (bukan berarti off), kecuali eksplisit di
     * set 0/off lewat setWelcomeAutoDelete
     * @param {string} jid
     * @returns {number} 0 kalau off
     */
    getWelcomeAutoDeleteSeconds(jid) {
        const settings = this.getWelcomeSettings(jid)
        if (!settings) return 0
        return settings.autoDeleteSeconds === undefined
            ? DEFAULT_WELCOME_AUTO_DELETE_SECONDS
            : settings.autoDeleteSeconds
    }

    /**
     * on/off welcome, opsional set pesan & background sekalian
     * @param {string} jid
     * @param {boolean} enabled
     * @param {{message?: string, background?: string}} [opts]
     * @returns {Promise<WelcomeActionResponse>}
     */
    async setWelcome(jid, enabled, opts = {}) {
        if (!jid) return fail(`invalid group jid`)

        const record = this.#getRecord(jid)
        const current = record.welcome || { enabled: false, message: DEFAULT_WELCOME_MESSAGE, background: undefined }

        const hasCustomOpts = opts.message !== undefined || opts.background !== undefined

        if (current.enabled && enabled && !hasCustomOpts) {
            return fail(`welcome is already on. want to turn it off? use 'welcome off'`)
        }

        if (!current.enabled && !enabled) {
            return fail(`welcome is already off. want to turn it on? use 'welcome on'`)
        }

        record.welcome = {
            enabled,
            message: opts.message !== undefined ? opts.message : current.message || DEFAULT_WELCOME_MESSAGE,
            background: opts.background !== undefined ? opts.background : current.background,
            autoDeleteSeconds: current.autoDeleteSeconds
        }

        groupSettingsDb.data[jid] = record
        await groupSettingsDb.save()

        if (current.enabled && enabled && hasCustomOpts) {
            return success(`welcome settings updated.`)
        }

        return success(`welcome ${enabled ? "enabled" : "disabled"} for this group.`)
    }

    /**
     * atur auto-delete pesan welcome (ala Karina), 0 / false buat matiin
     * @param {string} jid
     * @param {number} seconds
     * @returns {Promise<WelcomeActionResponse>}
     */
    async setWelcomeAutoDelete(jid, seconds) {
        if (!jid) return fail(`invalid group jid`)

        const record = this.#getRecord(jid)
        const current = record.welcome || { enabled: false, message: DEFAULT_WELCOME_MESSAGE, background: undefined }
        current.autoDeleteSeconds = seconds
        record.welcome = current

        groupSettingsDb.data[jid] = record
        await groupSettingsDb.save()

        return success(seconds > 0
            ? `welcome auto-delete set to ${seconds}s.`
            : `welcome auto-delete disabled.`)
    }

    /**
     * on/off notif promote, opsional set pesan
     * @param {string} jid
     * @param {boolean} enabled
     * @param {{message?: string}} [opts]
     * @returns {Promise<WelcomeActionResponse>}
     */
    async setPromote(jid, enabled, opts = {}) {
        if (!jid) return fail(`invalid group jid`)

        const record = this.#getRecord(jid)
        const current = record.promote || { enabled: false, message: DEFAULT_PROMOTE_MESSAGE }

        const hasCustomOpts = opts.message !== undefined

        if (current.enabled && enabled && !hasCustomOpts) {
            return fail(`promote notification is already on. want to turn it off? use 'promote off'`)
        }

        if (!current.enabled && !enabled) {
            return fail(`promote notification is already off. want to turn it on? use 'promote on'`)
        }

        record.promote = {
            enabled,
            message: opts.message !== undefined ? opts.message : current.message || DEFAULT_PROMOTE_MESSAGE
        }

        groupSettingsDb.data[jid] = record
        await groupSettingsDb.save()

        if (current.enabled && enabled && hasCustomOpts) {
            return success(`promote settings updated.`)
        }

        return success(`promote notification ${enabled ? "enabled" : "disabled"} for this group.`)
    }

    /**
     * on/off notif demote, opsional set pesan
     * @param {string} jid
     * @param {boolean} enabled
     * @param {{message?: string}} [opts]
     * @returns {Promise<WelcomeActionResponse>}
     */
    async setDemote(jid, enabled, opts = {}) {
        if (!jid) return fail(`invalid group jid`)

        const record = this.#getRecord(jid)
        const current = record.demote || { enabled: false, message: DEFAULT_DEMOTE_MESSAGE }

        const hasCustomOpts = opts.message !== undefined

        if (current.enabled && enabled && !hasCustomOpts) {
            return fail(`demote notification is already on. want to turn it off? use 'demote off'`)
        }

        if (!current.enabled && !enabled) {
            return fail(`demote notification is already off. want to turn it on? use 'demote on'`)
        }

        record.demote = {
            enabled,
            message: opts.message !== undefined ? opts.message : current.message || DEFAULT_DEMOTE_MESSAGE
        }

        groupSettingsDb.data[jid] = record
        await groupSettingsDb.save()

        if (current.enabled && enabled && hasCustomOpts) {
            return success(`demote settings updated.`)
        }

        return success(`demote notification ${enabled ? "enabled" : "disabled"} for this group.`)
    }

    /**
     * on/off goodbye, opsional set pesan & background sekalian
     * @param {string} jid
     * @param {boolean} enabled
     * @param {{message?: string, background?: string}} [opts]
     * @returns {Promise<WelcomeActionResponse>}
     */
    async setGoodbye(jid, enabled, opts = {}) {
        if (!jid) return fail(`invalid group jid`)

        const record = this.#getRecord(jid)
        const current = record.goodbye || { enabled: false, message: DEFAULT_GOODBYE_MESSAGE, background: undefined }

        const hasCustomOpts = opts.message !== undefined || opts.background !== undefined

        if (current.enabled && enabled && !hasCustomOpts) {
            return fail(`goodbye is already on. want to turn it off? use 'goodbye off'`)
        }

        if (!current.enabled && !enabled) {
            return fail(`goodbye is already off. want to turn it on? use 'goodbye on'`)
        }

        record.goodbye = {
            enabled,
            message: opts.message !== undefined ? opts.message : current.message || DEFAULT_GOODBYE_MESSAGE,
            background: opts.background !== undefined ? opts.background : current.background
        }

        groupSettingsDb.data[jid] = record
        await groupSettingsDb.save()

        if (current.enabled && enabled && hasCustomOpts) {
            return success(`goodbye settings updated.`)
        }

        return success(`goodbye ${enabled ? "enabled" : "disabled"} for this group.`)
    }

    /**
     * build teks welcome final (placeholder udah di ganti), null kalau welcome nya off
     * @param {string} jid
     * @param {{name: string, group: string, count: number, lid: string}} data
     * @returns {string|null}
     */
    buildWelcomeText(jid, data) {
        const settings = this.getWelcomeSettings(jid)
        if (!settings?.enabled) return null
        return applyPlaceholder(settings.message || DEFAULT_WELCOME_MESSAGE, data)
    }

    /**
     * build teks goodbye final (placeholder udah di ganti), null kalau goodbye nya off
     * @param {string} jid
     * @param {{name: string, group: string, count: number, lid: string}} data
     * @returns {string|null}
     */
    buildGoodbyeText(jid, data) {
        const settings = this.getGoodbyeSettings(jid)
        if (!settings?.enabled) return null
        return applyPlaceholder(settings.message || DEFAULT_GOODBYE_MESSAGE, data)
    }

    /**
     * build teks notif promote final (placeholder udah di ganti), null kalau off
     * @param {string} jid
     * @param {{name: string, group: string, count: number, lid: string}} data
     * @returns {string|null}
     */
    buildPromoteText(jid, data) {
        const settings = this.getPromoteSettings(jid)
        if (!settings?.enabled) return null
        return applyPlaceholder(settings.message || DEFAULT_PROMOTE_MESSAGE, data)
    }

    /**
     * build teks notif demote final (placeholder udah di ganti), null kalau off
     * @param {string} jid
     * @param {{name: string, group: string, count: number, lid: string}} data
     * @returns {string|null}
     */
    buildDemoteText(jid, data) {
        const settings = this.getDemoteSettings(jid)
        if (!settings?.enabled) return null
        return applyPlaceholder(settings.message || DEFAULT_DEMOTE_MESSAGE, data)
    }
}

const groupWelcomeManager = new GroupWelcomeManager()

export { groupWelcomeManager, DEFAULT_WELCOME_MESSAGE, DEFAULT_GOODBYE_MESSAGE, DEFAULT_PROMOTE_MESSAGE, DEFAULT_DEMOTE_MESSAGE }
