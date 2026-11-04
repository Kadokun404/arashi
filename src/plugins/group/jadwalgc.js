/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { ownerManager } from "#manager/owner-manager.js"
import { chatManager } from "#manager/chat-manager.js"
import { isGroupAdmin } from "#helper/group-admin.js"
import { groupOpenCloseManager, GroupState } from "#manager/group-open-close-manager.js"

/**
 * @param {string} arg
 * @returns {number|null} jam 0-23, null kalau gak valid
 */
function parseHour(arg) {
    const n = parseInt(arg, 10)
    if (isNaN(n) || n < 0 || n > 23) return null
    return n
}

function formatHour(hour) {
    return hour === null ? "-" : `${String(hour).padStart(2, "0")}:00`
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, jid, text } = ctx

    if (!chatManager.isGroupJid(jid)) {
        return await m.arashirep(`command ini cuma bisa dipake di grup`)
    }

    const isAllowed = ownerManager.isOwner(m.contact) || await isGroupAdmin({ sock: ctx.sock, m, jid })
    if (!isAllowed) {
        return await m.arashirep(`cuma admin grup / owner yang bisa atur jadwal grup`)
    }

    const [sub, ...rest] = (text || "").trim().split(/\s+/)
    const arg = rest.join(" ")
    const subLower = (sub || "").toLowerCase()

    if (!subLower) {
        const schedule = groupOpenCloseManager.getSchedule(jid)
        const state = groupOpenCloseManager.getState(jid)
        return await m.arashirep(
            `╭─❑ *JADWAL GRUP* ❑\n` +
            `│ Status sekarang : ${state === GroupState.OPEN ? "🔓 terbuka" : "🔒 tertutup"}\n` +
            `│ Buka otomatis   : ${formatHour(schedule?.openHour ?? null)}\n` +
            `│ Tutup otomatis  : ${formatHour(schedule?.closeHour ?? null)}\n` +
            `╰────────────\n\n` +
            `*cara atur:*\n` +
            `▸ *jadwalgc buka 7* — tiap hari jam 07:00 grup otomatis dibuka\n` +
            `▸ *jadwalgc tutup 22* — tiap hari jam 22:00 grup otomatis ditutup\n` +
            `▸ *jadwalgc off* — matiin semua jadwal\n\n` +
            `_jam pake format 24 jam (0-23). buat toggle manual/sementara, pake command *open* / *close*_`
        )
    }

    if (subLower === "off") {
        await groupOpenCloseManager.clearSchedule(jid)
        return await m.arashirep(`✅ jadwal buka/tutup otomatis di grup ini di matiin`)
    }

    if (subLower === "buka" || subLower === "open") {
        const hour = parseHour(arg)
        if (hour === null) return await m.arashirep(`jam nya gak valid, contoh: *jadwalgc buka 7* (format 24 jam, 0-23)`)
        await groupOpenCloseManager.setSchedule(jid, { openHour: hour })
        return await m.arashirep(`✅ grup bakal otomatis *dibuka* tiap hari jam ${formatHour(hour)}`)
    }

    if (subLower === "tutup" || subLower === "close") {
        const hour = parseHour(arg)
        if (hour === null) return await m.arashirep(`jam nya gak valid, contoh: *jadwalgc tutup 22* (format 24 jam, 0-23)`)
        await groupOpenCloseManager.setSchedule(jid, { closeHour: hour })
        return await m.arashirep(`✅ grup bakal otomatis *ditutup* tiap hari jam ${formatHour(hour)}`)
    }

    return await m.arashirep(`opsi gak valid, pakai: *jadwalgc buka <jam>*, *jadwalgc tutup <jam>*, atau *jadwalgc off*`)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "jadwal grup",
    commands: ["jadwalgc", "gcschedule"],
    categories: ["group"],
    description: "atur jadwal harian buka/tutup otomatis grup (contoh: *jadwalgc buka 7*, *jadwalgc tutup 22*, *jadwalgc off*)"
}

plugin.meta = {
    filename: "jadwalgc.js",
    version: "1",
    author: "Kado",
    note: "jadwal di simpen & di cek tiap 1 menit di group-open-close-manager.js (data/group-open-close-config.json). buat toggle manual/sementara pake command open/close (open-close.js)",
    path: "group"
}

export default plugin