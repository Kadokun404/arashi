/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { ownerManager } from "#manager/owner-manager.js"
import { chatManager } from "#manager/chat-manager.js"
import { groupOpenCloseManager, GroupState } from "#manager/group-open-close-manager.js"
import { parseDurationMs } from "#helper/parse-duration.js"

const STATE_EMOJI = { [GroupState.OPEN]: "🔓", [GroupState.CLOSED]: "🔒" }

/**
 * @param {number} ms
 * @returns {string} durasi human readable, contoh "2 jam 30 menit"
 */
function formatDuration(ms) {
    const totalMinutes = Math.round(ms / 60000)
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60

    const parts = []
    if (days) parts.push(`${days} hari`)
    if (hours) parts.push(`${hours} jam`)
    if (minutes) parts.push(`${minutes} menit`)
    return parts.join(" ") || "sebentar"
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, command, text } = ctx

    if (!chatManager.isGroupJid(jid)) {
        return await m.arashirep(`command *${command}* cuma bisa dipake di grup`)
    }

    const isAllowed = ownerManager.isOwner(m.contact) || !!m.group?.admin
    if (!isAllowed) {
        return await m.arashirep(`cuma admin grup / owner yang bisa ${command === "open" ? "buka" : "tutup"} grup`)
    }

    const targetState = command === "open" ? GroupState.OPEN : GroupState.CLOSED
    const durationMs = parseDurationMs(text)

    try {
        await groupOpenCloseManager.setNow(jid, targetState, durationMs)
    } catch (e) {
        return await m.arashirep(`❌ gagal ${command === "open" ? "buka" : "tutup"} grup: ${e.message}`)
    }

    const emoji = STATE_EMOJI[targetState]
    const label = targetState === GroupState.OPEN ? "dibuka" : "ditutup"
    const revertLabel = targetState === GroupState.OPEN ? "tertutup" : "terbuka"

    if (durationMs) {
        return await m.arashirep(
            `${emoji} grup ${label}${targetState === GroupState.CLOSED ? " (cuma admin yang bisa kirim pesan)" : ""}.\n` +
            `otomatis balik jadi ${revertLabel} lagi dalam ${formatDuration(durationMs)}`
        )
    }

    return await m.arashirep(`${emoji} grup ${label}${targetState === GroupState.CLOSED ? ", cuma admin yang bisa kirim pesan" : ", semua member bisa kirim pesan lagi"}`)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "open close group",
    commands: ["open", "close"],
    categories: ["group"],
    description: "buka/tutup grup (cuma admin yang bisa kirim pesan pas ditutup). bisa dikasih durasi buat toggle sementara, contoh: *close 2h*, *open 1m*, *close 1 jam 30 menit*. buat jadwal harian otomatis, pake command *jadwalgc*"
}

plugin.meta = {
    filename: "open-close.js",
    version: "1",
    author: "Kado",
    note: "state & timer delay di simpen di group-open-close-manager.js (data/group-open-close-config.json). durasi di parse pake parse-duration.js, support satuan s/detik, m/menit, h/j/jam, d/hari, bisa gabungan (contoh '1h30m')",
    path: "group"
}

export default plugin