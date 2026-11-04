import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
import { allPaths } from "#core/all-paths.js"

const DATABASES = [
    { name: "crmdb.db", path: path.join(process.cwd(), "data", "crmdb.db"), table: "messages", timeCol: "timestamp", isSec: true },
    { name: "messagestore.db", path: path.join(process.cwd(), "data", "messagestore.db"), table: "stored_messages", timeCol: "timestamp", isSec: false },
    { name: "database.db", path: path.join(process.cwd(), "data", "database.db") },
    { name: "gamedb.db", path: path.join(process.cwd(), "data", "gamedb.db") }
]

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B"
    const units = ["B", "KB", "MB", "GB"]
    let i = 0
    let num = bytes
    while (num >= 1024 && i < units.length - 1) {
        num /= 1024
        i++
    }
    return `${num.toFixed(2)} ${units[i]}`
}

function getFileSize(filePath) {
    try {
        if (!fs.existsSync(filePath)) return 0
        return fs.statSync(filePath).size
    } catch {
        return 0
    }
}

export const housekeepingManager = {
    /**
     * Memastikan database memiliki PRAGMA auto_vacuum = INCREMENTAL (2).
     * Jika saat ini bernilai 0 (NONE), lakukan VACUUM satu kali agar setting aktif permanen di header DB.
     */
    async ensureIncrementalVacuum() {
        const results = []
        for (const target of DATABASES) {
            if (!fs.existsSync(target.path)) continue

            try {
                const db = new DatabaseSync(target.path)
                const current = db.prepare("PRAGMA auto_vacuum").get()
                const autoVac = current?.auto_vacuum ?? 0

                if (autoVac === 0) {
                    console.log(`[housekeeping] Mengaktifkan auto_vacuum = INCREMENTAL pada ${target.name}...`)
                    db.exec("PRAGMA auto_vacuum = INCREMENTAL")
                    db.exec("VACUUM")
                    db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
                    results.push({ name: target.name, status: "migrated_to_incremental" })
                } else {
                    results.push({ name: target.name, status: "already_incremental" })
                }
                db.close()
            } catch (err) {
                console.error(`[housekeeping] Gagal migrasi auto_vacuum ${target.name}:`, err.message)
                results.push({ name: target.name, status: "error", error: err.message })
            }
        }
        return results
    },

    /**
     * Bersihkan pesan usang di SQLite dan reclaim space via incremental_vacuum + wal_checkpoint
     * @param {number} retentionDays Jumlah hari retensi pesan (default: 30 hari)
     */
    async cleanOldDatabaseRecords(retentionDays = 30) {
        const nowSec = Math.floor(Date.now() / 1000)
        const nowMs = Date.now()
        const retentionSec = retentionDays * 86400
        const retentionMs = retentionDays * 86400 * 1000

        const stats = {
            deletedMessages: 0,
            beforeBytes: 0,
            afterBytes: 0,
            freedBytes: 0
        }

        for (const target of DATABASES) {
            if (!fs.existsSync(target.path)) continue

            const initialDbSize = getFileSize(target.path)
            const initialWalSize = getFileSize(`${target.path}-wal`)
            stats.beforeBytes += (initialDbSize + initialWalSize)

            try {
                const db = new DatabaseSync(target.path)
                db.exec("PRAGMA busy_timeout = 5000")

                if (target.table && target.timeCol) {
                    const cutoff = target.isSec ? (nowSec - retentionSec) : (nowMs - retentionMs)
                    const res = db.prepare(`DELETE FROM ${target.table} WHERE ${target.timeCol} < ? AND ${target.timeCol} > 0`).run(cutoff)
                    stats.deletedMessages += (res.changes || 0)
                }

                // Cek auto_vacuum
                const av = db.prepare("PRAGMA auto_vacuum").get()?.auto_vacuum ?? 0
                if (av === 2) {
                    db.exec("PRAGMA incremental_vacuum")
                } else if (av === 0) {
                    // Jika masih 0, jalankan VACUUM
                    db.exec("PRAGMA auto_vacuum = INCREMENTAL")
                    db.exec("VACUUM")
                }

                // Checkpoint WAL agar file .db-wal di-flush dan di-truncate ke 0
                db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
                db.close()
            } catch (err) {
                console.error(`[housekeeping] Gagal optimize ${target.name}:`, err.message)
            }

            const finalDbSize = getFileSize(target.path)
            const finalWalSize = getFileSize(`${target.path}-wal`)
            stats.afterBytes += (finalDbSize + finalWalSize)
        }

        stats.freedBytes = Math.max(0, stats.beforeBytes - stats.afterBytes)
        return stats
    },

    /**
     * Bersihkan file sampah di folder temp yang lebih tua dari batas usia (default: 24 jam)
     * @param {number} maxAgeMs Batas usia file dalam ms (default: 24 jam)
     */
    async cleanTempFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
        const tempDirs = [
            allPaths.temp,
            path.join(allPaths.temp, "ara-media"),
            path.join(process.cwd(), "cache", "play")
        ]

        let filesDeleted = 0
        let bytesFreed = 0
        const now = Date.now()

        for (const dir of tempDirs) {
            if (!fs.existsSync(dir)) continue

            try {
                const files = fs.readdirSync(dir)
                for (const file of files) {
                    if (file === "index.json") continue // Pertahankan index cache play
                    const fullPath = path.join(dir, file)
                    try {
                        const stat = fs.statSync(fullPath)
                        if (stat.isDirectory()) {
                            // Cek apakah direktori kosong atau sudah usang
                            const sub = fs.readdirSync(fullPath)
                            if (sub.length === 0 || (now - stat.mtimeMs > maxAgeMs)) {
                                fs.rmSync(fullPath, { recursive: true, force: true })
                                filesDeleted++
                            }
                        } else if (now - stat.mtimeMs > maxAgeMs) {
                            bytesFreed += stat.size
                            fs.unlinkSync(fullPath)
                            filesDeleted++
                        }
                    } catch (_) {}
                }
            } catch (_) {}
        }

        return { filesDeleted, bytesFreed }
    },

    /**
     * Jalankan seluruh suite housekeeping
     * @param {number} retentionDays
     */
    async runFullHousekeeping(retentionDays = 30) {
        console.log("[housekeeping] Memulai perawatan rutin bot...")
        await this.ensureIncrementalVacuum()
        const dbStats = await this.cleanOldDatabaseRecords(retentionDays)
        const tempStats = await this.cleanTempFiles()

        console.log(
            `[housekeeping] Selesai: Hapus ${dbStats.deletedMessages} pesan usang, ` +
            `bersihkan ${tempStats.filesDeleted} file temp. ` +
            `Total space dihemat: ${formatBytes(dbStats.freedBytes + tempStats.bytesFreed)}`
        )

        return {
            dbStats,
            tempStats,
            formattedTotalFreed: formatBytes(dbStats.freedBytes + tempStats.bytesFreed)
        }
    },

    /**
     * Mulai scheduler background (jalan tiap 24 jam)
     */
    startScheduler(retentionDays = 30) {
        const INTERVAL_MS = 24 * 60 * 60 * 1000
        // Jalankan pemeriksaan awal setelah bot stabil (2 menit)
        setTimeout(() => {
            this.runFullHousekeeping(retentionDays).catch((e) =>
                console.error("[housekeeping/scheduler] Error:", e.message)
            )
        }, 120000).unref()

        // Recurring interval tiap 24 jam
        setInterval(() => {
            this.runFullHousekeeping(retentionDays).catch((e) =>
                console.error("[housekeeping/scheduler] Error:", e.message)
            )
        }, INTERVAL_MS).unref()
    }
}

export default housekeepingManager
