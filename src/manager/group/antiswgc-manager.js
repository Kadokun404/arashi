import fs from "fs"
import { allPaths } from "#core/all-paths.js"
import path from "path"

const FILE = allPaths.antiswgcDb || path.join(process.cwd(), "data", "antiswgc.json")
fs.mkdirSync(path.dirname(FILE), { recursive: true })

/** @type {Map<string, { enabled: boolean, kick: boolean }>} */
const configs = new Map()

try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"))
    if (Array.isArray(raw)) {
        for (const jid of raw) {
            configs.set(jid, { enabled: true, kick: false })
        }
    } else if (raw && typeof raw === "object") {
        for (const [jid, val] of Object.entries(raw)) {
            if (typeof val === "boolean") {
                configs.set(jid, { enabled: val, kick: false })
            } else if (val && typeof val === "object") {
                configs.set(jid, { enabled: !!val.enabled, kick: !!val.kick })
            }
        }
    }
} catch {
    // empty
}

const save = () => {
    try {
        const obj = Object.fromEntries(configs.entries())
        fs.writeFileSync(FILE, JSON.stringify(obj, null, 2))
    } catch (e) {
        console.error("[antiswgc] failed to save data", e)
    }
}

class AntiSwGcManager {
    /**
     * @param {string} jid
     * @returns {boolean}
     */
    isEnabled(jid) {
        if (!jid) return false
        return !!configs.get(jid)?.enabled
    }

    /**
     * @param {string} jid
     * @returns {boolean}
     */
    isKick(jid) {
        if (!jid) return false
        const conf = configs.get(jid)
        return !!conf?.enabled && !!conf?.kick
    }

    /**
     * @param {string} jid
     * @param {boolean} [kick]
     * @returns {boolean}
     */
    enable(jid, kick) {
        if (!jid) return false
        const current = configs.get(jid) || { enabled: false, kick: false }
        const newKick = kick !== undefined ? kick : current.kick
        configs.set(jid, { enabled: true, kick: newKick })
        save()
        return true
    }

    /**
     * @param {string} jid
     * @returns {boolean}
     */
    disable(jid) {
        if (!jid) return false
        const current = configs.get(jid)
        if (!current?.enabled) return false
        configs.set(jid, { enabled: false, kick: current.kick })
        save()
        return true
    }

    /**
     * @param {string} jid
     * @param {boolean} kick
     * @returns {boolean}
     */
    setKick(jid, kick) {
        if (!jid) return false
        const current = configs.get(jid) || { enabled: false, kick: false }
        configs.set(jid, { enabled: current.enabled, kick })
        save()
        return true
    }

    /**
     * @param {string} jid
     * @returns {{ enabled: boolean, kick: boolean }}
     */
    getConfig(jid) {
        return configs.get(jid) || { enabled: false, kick: false }
    }
}

export const antiSwGcManager = new AntiSwGcManager()
