/**
 * heavy-queue-manager.js
 *
 * Mengatur antrean (concurrency limiter) dan cooldown anti-spam untuk plugin
 * berat (seperti downloader video/audio, pembuat stiker pack, ffmpeg, dsb)
 * agar server tidak kehabisan CPU & RAM jika banyak user request bersamaan.
 */

const MAX_CONCURRENT = 2 // Maksimal tugas berat yang berjalan bersamaan
const USER_COOLDOWN_MS = 5000 // Cooldown 5 detik per-user antar tugas berat
const HEAVY_COMMANDS = new Set([
    "aio", "aiodl", "getdl",
    "play", "yp", "ytp", "ypv", "ytmp3", "ytv",
    "tt", "tiktok",
    "ig", "instagram",
    "fb", "facebook",
    "tspk", "sendtspk",
    "mediafire", "pixeldrain", "vdrop"
])

class HeavyQueueManager {
    constructor() {
        /** @type {Map<string, { startedAt: number, command: string }>} */
        this.activeTasks = new Map() // key: taskId
        /** @type {Map<string, number>} */
        this.userCooldowns = new Map() // key: userId, val: lastFinishedAt
        this.taskCounter = 0
    }

    /**
     * Cek apakah plugin/perintah tergolong tugas berat
     * @param {object} plugin
     * @param {string} command
     */
    isHeavy(plugin, command) {
        if (!plugin && !command) return false
        if (plugin?.config?.heavy === true) return true
        if (plugin?.config?.heavy === false) return false
        if (plugin?.categories?.includes("downloader")) return true
        if (command && HEAVY_COMMANDS.has(String(command).toLowerCase())) return true
        return false
    }

    /**
     * Periksa apakah user diizinkan menjalankan tugas berat saat ini
     * @param {string} userId
     * @param {boolean} isOwner
     * @returns {{ allowed: boolean, reason?: "cooldown" | "queue_full", remaining?: number, active?: number, max?: number }}
     */
    canExecute(userId, isOwner = false) {
        // Owner bypass limit & cooldown
        if (isOwner) {
            return { allowed: true }
        }

        const now = Date.now()

        // 1. Cek Cooldown User
        const lastFinished = this.userCooldowns.get(userId) || 0
        const elapsed = now - lastFinished
        if (elapsed < USER_COOLDOWN_MS) {
            const remaining = Math.ceil((USER_COOLDOWN_MS - elapsed) / 1000)
            return {
                allowed: false,
                reason: "cooldown",
                remaining
            }
        }

        // 2. Cek Batas Konkurensi Sistem
        // Bersihkan tugas aktif yang menggantung > 3 menit (safety timeout)
        for (const [taskId, info] of this.activeTasks.entries()) {
            if (now - info.startedAt > 180000) {
                this.activeTasks.delete(taskId)
            }
        }

        if (this.activeTasks.size >= MAX_CONCURRENT) {
            return {
                allowed: false,
                reason: "queue_full",
                active: this.activeTasks.size,
                max: MAX_CONCURRENT
            }
        }

        return { allowed: true }
    }

    /**
     * Catat tugas berat dimulai
     * @param {string} userId
     * @param {string} command
     * @returns {string} taskId
     */
    acquire(userId, command) {
        const taskId = `task_${Date.now()}_${++this.taskCounter}`
        this.activeTasks.set(taskId, {
            userId,
            command,
            startedAt: Date.now()
        })
        return taskId
    }

    /**
     * Catat tugas berat selesai dan set cooldown untuk user
     * @param {string} taskId
     * @param {string} userId
     */
    release(taskId, userId) {
        if (taskId) {
            this.activeTasks.delete(taskId)
        }
        if (userId) {
            this.userCooldowns.set(userId, Date.now())
        }
    }

    /**
     * Ambil statistik antrean saat ini
     */
    getStatus() {
        return {
            active: this.activeTasks.size,
            max: MAX_CONCURRENT,
            tasks: Array.from(this.activeTasks.values())
        }
    }
}

export const heavyQueueManager = new HeavyQueueManager()
export default heavyQueueManager
