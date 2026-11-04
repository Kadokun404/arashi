import { pluginEnabledDb } from "#database/plugin-enabled-store.js"
import { formatDateDDMMYYYY } from "#helper/date.js"

/**
 * @typedef {object} EnableActionResponse
 * @property {boolean} ok
 * @property {string} message
 */

/**
 * @param {string} message
 * @returns {EnableActionResponse}
 */
const fail = (message) => ({ ok: false, message })

/**
 * @param {string} message
 * @returns {EnableActionResponse}
 */
const success = (message) => ({ ok: true, message })

/**
 * plugin enable/disable manager, json based (data/plugin-enabled.json)
 * pola sama kayak owner-manager (trust) / premium-manager, tapi datanya
 * cuma nyimpen command yang di-DISABLE (default semua command enabled,
 * kalau gak ada di list ini berarti nyala)
 */
class PluginEnableManager {
    /**
     * cek apakah command masih nyala (belum di-disable)
     * @param {string} command
     * @returns {boolean}
     */
    isEnabled(command) {
        if (!command) return true
        return !pluginEnabledDb.data.some(row => row.command === command)
    }

    /**
     * matiin sebuah command
     * @param {string} command
     * @param {{lid: string|undefined, pn: string|undefined}} disabledBy
     * @returns {Promise<EnableActionResponse>}
     */
    async disable(command, disabledBy) {
        if (!command) return fail(`command nya kosong kak`)

        const alreadyDisabled = pluginEnabledDb.data.some(row => row.command === command)
        if (alreadyDisabled) return fail(`${command} itu emang uda disable byy`)

        pluginEnabledDb.data.push({
            command,
            disabledBy,
            disabledAt: formatDateDDMMYYYY()
        })
        await pluginEnabledDb.save()

        return success(`${command} berhasil di-disable`)
    }

    /**
     * nyalain lagi sebuah command
     * @param {string} command
     * @returns {Promise<EnableActionResponse>}
     */
    async enable(command) {
        if (!command) return fail(`command nya kosong kak`)

        const idx = pluginEnabledDb.data.findIndex(row => row.command === command)
        if (idx === -1) return fail(`fitur ${command} emang ga disable `)

        pluginEnabledDb.data.splice(idx, 1)
        await pluginEnabledDb.save()

        return success(`fitur ${command} berhasil di-enable lagi`)
    }

    /**
     * list semua command yang lagi di-disable
     * @returns {Array<import("#database/plugin-enabled-store.js").DisabledCommandRecord>}
     */
    list() {
        return pluginEnabledDb.data
    }
}

const pluginEnableManager = new PluginEnableManager()

export { pluginEnableManager }
