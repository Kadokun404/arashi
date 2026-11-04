import { pamDb } from "#database/pam-store.js"
import { formatDateDDMMYYYY } from "#helper/date.js"

/**
 * @typedef {object} PamActionResponse
 * @property {boolean} ok
 * @property {string} message
 */

/**@param {string} message @returns {PamActionResponse} */
const fail = (message) => ({ ok: false, message })

/**@param {string} message @returns {PamActionResponse} */
const success = (message) => ({ ok: true, message })

/**
 * Plugin Access Manager (PAM)
 * Manages plugin/command access for specific users or whole groups.
 */
class PamManager {
    /**
     * Check if a contact or group has PAM access to a command
     * @param {{lid?: string, pn?: string, name?: string}} [contact]
     * @param {string} command
     * @param {string} [jid]
     * @returns {boolean}
     */
    hasAccess(contact, command, jid) {
        if (!command) return false

        // 1. Group level access
        if (jid && typeof jid === "string" && jid.endsWith("@g.us")) {
            const groupAllowed = pamDb.data.some(row =>
                row.command === command &&
                (row.type === "group" || row.jid?.endsWith("@g.us")) &&
                row.jid === jid
            )
            if (groupAllowed) return true
        }

        // 2. User level access
        if (!contact) return false
        const { lid, pn, name } = contact
        const lowerName = name ? String(name).toLowerCase().trim() : null

        return pamDb.data.some(row => {
            if (row.command !== command) return false
            if (row.type === "group") return false
            if (lid && row.lid === lid) return true
            if (pn && row.pn === pn) return true
            if (lowerName && row.name && String(row.name).toLowerCase().trim() === lowerName) return true
            return false
        })
    }

    /**
     * Grant command access to target(s)
     * @param {object} param
     * @param {Array<{type?: string, jid?: string, lid?: string, pn?: string, name?: string}>} param.targets
     * @param {string[]} param.commands
     * @param {{lid?: string, pn?: string}} [param.grantedBy]
     * @param {import("./plugin-manager.js").pluginManager} [param.pluginManager]
     * @returns {Promise<PamActionResponse>}
     */
    async grant({ targets, commands, grantedBy, pluginManager }) {
        if (!targets?.length) return fail(`target required. specify user name, mention, reply, or 'group'`)
        if (!commands?.length) return fail(`commands required. example: pam grant group ping`)

        const grantedAt = formatDateDDMMYYYY()
        const perTargetLines = []
        let anySaved = false

        for (const target of targets) {
            const isGroup = target.type === "group" || target.jid?.endsWith("@g.us")
            const displayName = target.name || (isGroup ? "group" : "user")

            const added = []
            const skippedDuplicate = []
            const invalid = []

            for (const command of commands) {
                const pluginExist = pluginManager?.pluginMap?.has(command)
                if (pluginManager && !pluginExist) {
                    invalid.push(command)
                    continue
                }

                let isDuplicate = false
                if (isGroup) {
                    isDuplicate = pamDb.data.some(row =>
                        (row.type === "group" || row.jid) &&
                        row.jid === target.jid &&
                        row.command === command
                    )
                } else {
                    isDuplicate = this.hasAccess(target, command)
                }

                if (isDuplicate) {
                    skippedDuplicate.push(command)
                    continue
                }

                pamDb.data.push({
                    type: isGroup ? "group" : "user",
                    ...(isGroup ? { jid: target.jid } : { lid: target.lid, pn: target.pn }),
                    name: displayName,
                    command,
                    grantedBy: grantedBy || {},
                    grantedAt
                })
                added.push(command)
                anySaved = true
            }

            const lines = [`• ${displayName}:`]
            if (added.length) lines.push(`  granted: ${added.join(', ')}`)
            if (skippedDuplicate.length) lines.push(`  skipped: ${skippedDuplicate.join(', ')} (already granted)`)
            if (invalid.length) lines.push(`  not found: ${invalid.join(', ')}`)
            perTargetLines.push(lines.join('\n'))
        }

        if (anySaved) await pamDb.save()

        const body = perTargetLines.join('\n\n')
        return anySaved ? success(body) : fail(body)
    }

    /**
     * Revoke command access from target(s)
     * @param {object} param
     * @param {Array<{type?: string, jid?: string, lid?: string, pn?: string, name?: string}>} param.targets
     * @param {string[]} param.commands
     * @returns {Promise<PamActionResponse>}
     */
    async revoke({ targets, commands }) {
        if (!targets?.length) return fail(`target required. specify user name, mention, reply, or 'group'`)

        const revokeAll = !commands?.length
        const perTargetLines = []
        let anyRevoked = false

        for (const target of targets) {
            const isGroup = target.type === "group" || target.jid?.endsWith("@g.us")
            const displayName = target.name || (isGroup ? "group" : "user")

            const matchTarget = row => {
                if (isGroup) {
                    return (row.type === "group" || row.jid) && row.jid === target.jid
                }
                if (row.type === "group") return false
                if (target.lid && row.lid === target.lid) return true
                if (target.pn && row.pn === target.pn) return true
                if (target.name && row.name && String(row.name).toLowerCase().trim() === String(target.name).toLowerCase().trim()) return true
                return false
            }

            if (revokeAll) {
                const existing = pamDb.data.filter(matchTarget)
                if (!existing.length) {
                    perTargetLines.push(`• ${displayName}: no active permissions`)
                    continue
                }

                for (let i = pamDb.data.length - 1; i >= 0; i--) {
                    if (matchTarget(pamDb.data[i])) pamDb.data.splice(i, 1)
                }
                anyRevoked = true
                perTargetLines.push(`• ${displayName}: revoked all (${existing.map(r => r.command).join(', ')})`)
                continue
            }

            const revoked = []
            const notFound = []
            for (const command of commands) {
                const idx = pamDb.data.findIndex(row => row.command === command && matchTarget(row))
                if (idx === -1) {
                    notFound.push(command)
                    continue
                }
                pamDb.data.splice(idx, 1)
                revoked.push(command)
                anyRevoked = true
            }

            const lines = [`• ${displayName}:`]
            if (revoked.length) lines.push(`  revoked: ${revoked.join(', ')}`)
            if (notFound.length) lines.push(`  not found: ${notFound.join(', ')}`)
            perTargetLines.push(lines.join('\n'))
        }

        if (anyRevoked) await pamDb.save()

        const body = perTargetLines.join('\n\n')
        return anyRevoked ? success(body) : fail(body)
    }

    /**
     * Get all PAM records grouped by user and group
     * @returns {Array<{type: string, jid?: string, lid?: string, pn?: string, name: string, commands: string[]}>}
     */
    view() {
        const grouped = new Map()

        for (const row of pamDb.data) {
            const isGroup = row.type === "group" || row.jid?.endsWith("@g.us")
            const key = isGroup
                ? `group:${row.jid}`
                : `user:${row.name ? row.name.toLowerCase() : (row.lid || row.pn || "unknown")}`

            if (!grouped.has(key)) {
                grouped.set(key, {
                    type: isGroup ? "group" : "user",
                    jid: row.jid,
                    lid: row.lid,
                    pn: row.pn,
                    name: row.name || (isGroup ? "group" : "user"),
                    commands: []
                })
            }
            if (!grouped.get(key).commands.includes(row.command)) {
                grouped.get(key).commands.push(row.command)
            }
        }

        return [...grouped.values()]
    }

    /**
     * Reset all PAM permissions
     * @returns {Promise<PamActionResponse>}
     */
    async nuke() {
        const total = pamDb.data.length
        await pamDb.clear()
        return success(`all pam access reset (${total} entries removed).`)
    }
}

const pamManager = new PamManager()

export { pamManager }
