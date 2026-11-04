import { debugManager } from "#manager/debug-manager.js"
import { housekeepingManager } from "#manager/housekeeping-manager.js"
import { config } from "#root/config.js"

const HELP_TEXT = `haloo sayangg, ini cara pakai db:\n\n` +
    `on [ aktifin debug mode ]\n` +
    `off [ matiin debug mode ]\n` +
    `view [ liat isi root folder bot beserta size masing masing sama totalnya ]\n` +
    `clear [ beberin file db, vacuum sqlite sama bersihin folder temp biar gak berat, trust.json sama pam.json aman gak ke sentuh ]`

async function run(ctx) {
    const { m, text } = ctx
    const subcommand = (text || '').trim().split(/\s+/)[0]?.toLowerCase()

    if (subcommand === "on") {
        const result = await debugManager.on()
        return await m.arashirep(result.message)
    }

    if (subcommand === "off") {
        const result = await debugManager.off()
        return await m.arashirep(result.message)
    }

    if (subcommand === "view") {
        const text = await debugManager.view()
        return await m.arashirep(text)
    }

    if (subcommand === "clear") {
        await m.arashirep("⏳ Menjalankan housekeeping (migrasi auto_vacuum, checkpoint WAL, dan pembersihan file temp)...")
        const res = await housekeepingManager.runFullHousekeeping(30)
        return await m.arashirep(
            `🧹 *HOUSEKEEPING & PERAWATAN SELESAI*\n────────────────────\n` +
            `• Pesan usang dihapus : ${res.dbStats.deletedMessages.toLocaleString("id-ID")}\n` +
            `• File temp dibersihkan: ${res.tempStats.filesDeleted.toLocaleString("id-ID")}\n` +
            `• Total ruang dihemat : *${res.formattedTotalFreed}*\n` +
            `• Status auto_vacuum   : *INCREMENTAL (Aktif)*\n` +
            `• WAL Checkpoint       : *TRUNCATED (Bersih)*\n────────────────────`
        )
    }

    return await m.arashirep(HELP_TEXT)
}

const plugin = { run }

plugin.name = "database manager"
plugin.commands = ["db"]
plugin.categories = ["tools"]
plugin.description = "buat ngatur debug mode & maintenance database bot\n\n" + HELP_TEXT

plugin.meta = {
    filename: "db.js",
    author: config.devName,
    note: "db on/off/view/clear",
    version: "1",
    path: "tools"
}

plugin.config = {
    protected: true
}

export default plugin