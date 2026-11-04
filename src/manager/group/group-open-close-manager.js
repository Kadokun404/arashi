import { allPaths } from "#core/all-paths.js"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const CONFIG_PATH = allPaths.groupOpenCloseConfig

class GroupState {
    static OPEN = "open"
    static CLOSED = "closed"
}

/**
 * @typedef {object} GroupOpenCloseRecord
 * @property {string} state salah satu dari GroupState
 * @property {{openHour: number|null, closeHour: number|null}|null} schedule jadwal harian (jam 0-23), null kalau gak ada jadwal
 * @property {{open: string|null, close: string|null}} lastTrigger tanggal (yyyy-mm-dd) terakhir jadwal ke trigger, biar gak dobel dalam 1 hari yang sama
 */

/**
 * ngatur buka/tutup grup (announcement setting whatsapp), termasuk:
 * - toggle manual sekarang (open/close)
 * - toggle sementara (delay), abis itu otomatis balik ke kondisi sebaliknya
 * - jadwal harian (buka jam X, tutup jam Y), di cek tiap menit lewat background interval
 */
class GroupOpenCloseManager {
    /** @type {Map<string, GroupOpenCloseRecord>} */
    #groups = new Map()

    /** @type {Map<string, NodeJS.Timeout>} timer buat toggle sementara (delay), 1 grup cuma boleh 1 timer aktif */
    #delayedTimers = new Map()

    #tickerStarted = false

    /**
     * pasang setting whatsapp beneran (groupSettingUpdate) + update state di memory
     * @param {string} jid
     * @param {string} state salah satu dari GroupState
     */
    async #applyToWhatsapp(jid, state) {
        const sock = global._?.sock
        if (!sock) throw new Error("bot belum konek ke whatsapp")
        await sock.groupSettingUpdate(jid, state === GroupState.CLOSED ? "announcement" : "not_announcement")
    }

    #getOrCreate(jid) {
        let record = this.#groups.get(jid)
        if (!record) {
            record = { state: GroupState.OPEN, schedule: null, lastTrigger: { open: null, close: null } }
            this.#groups.set(jid, record)
        }
        return record
    }

    /**
     * @param {string} jid
     * @returns {string} salah satu dari GroupState
     */
    getState(jid) {
        return this.#groups.get(jid)?.state ?? GroupState.OPEN
    }

    /**
     * @param {string} jid
     * @returns {{openHour: number|null, closeHour: number|null}|null}
     */
    getSchedule(jid) {
        return this.#groups.get(jid)?.schedule ?? null
    }

    /**
     * toggle grup sekarang, opsional otomatis balik lagi setelah durasi tertentu
     * @param {string} jid
     * @param {string} state salah satu dari GroupState (kondisi yang mau di set SEKARANG)
     * @param {number|null} [delayMs] kalau di isi, abis durasi ini grup otomatis balik ke kondisi sebaliknya
     */
    async setNow(jid, state, delayMs = null) {
        // batalin timer delay lama kalau ada, biar gak tabrakan
        const existingTimer = this.#delayedTimers.get(jid)
        if (existingTimer) {
            clearTimeout(existingTimer)
            this.#delayedTimers.delete(jid)
        }

        await this.#applyToWhatsapp(jid, state)
        const record = this.#getOrCreate(jid)
        record.state = state
        await this.#save()

        if (delayMs) {
            const revertState = state === GroupState.OPEN ? GroupState.CLOSED : GroupState.OPEN
            const timer = setTimeout(async () => {
                this.#delayedTimers.delete(jid)
                try {
                    await this.#applyToWhatsapp(jid, revertState)
                    const rec = this.#getOrCreate(jid)
                    rec.state = revertState
                    await this.#save()
                } catch (e) {
                    console.error(`[group-open-close] gagal auto-${revertState} grup ${jid}`, e)
                }
            }, delayMs)
            this.#delayedTimers.set(jid, timer)
        }
    }

    /**
     * set/update jadwal harian buka & tutup grup. null buat salah satu param artinya gak diubah.
     * @param {string} jid
     * @param {object} param
     * @param {number|null} [param.openHour] jam buka (0-23), null = gak di set / di hapus
     * @param {number|null} [param.closeHour] jam tutup (0-23), null = gak di set / di hapus
     */
    async setSchedule(jid, { openHour = undefined, closeHour = undefined } = {}) {
        const record = this.#getOrCreate(jid)
        const current = record.schedule ?? { openHour: null, closeHour: null }
        record.schedule = {
            openHour: openHour === undefined ? current.openHour : openHour,
            closeHour: closeHour === undefined ? current.closeHour : closeHour
        }
        await this.#save()
    }

    /**
     * @param {string} jid
     */
    async clearSchedule(jid) {
        const record = this.#groups.get(jid)
        if (!record) return
        record.schedule = null
        await this.#save()
    }

    /**
     * jalan tiap menit, cek semua grup yang punya jadwal, toggle kalau jamnya udah pas
     * dan belum ke trigger hari ini (biar gak dobel selama 1 jam yang sama)
     */
    async #tick() {
        const sock = global._?.sock
        if (!sock) return

        const tz = global.timezone || "Asia/Jakarta"
        const now = new Date()
        const hourStr = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now)
        const hour = parseInt(hourStr, 10) % 24
        const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now)

        for (const [jid, record] of this.#groups) {
            const sch = record.schedule
            if (!sch) continue

            if (sch.openHour !== null && sch.openHour === hour && record.lastTrigger.open !== dateKey) {
                try {
                    await this.#applyToWhatsapp(jid, GroupState.OPEN)
                    record.state = GroupState.OPEN
                    record.lastTrigger.open = dateKey
                    await this.#save()
                    await sock.sendMessage(jid, {
                        text: `🔓 *JADWAL GRUP*\nGrup telah otomatis dibuka kembali (Jadwal: ${String(sch.openHour).padStart(2, "0")}:00 WIB). Selamat beraktivitas! ✨`
                    }).catch(() => {})
                } catch (e) {
                    console.error(`[group-open-close] gagal auto-open jadwal grup ${jid}`, e)
                }
            }

            if (sch.closeHour !== null && sch.closeHour === hour && record.lastTrigger.close !== dateKey) {
                try {
                    await this.#applyToWhatsapp(jid, GroupState.CLOSED)
                    record.state = GroupState.CLOSED
                    record.lastTrigger.close = dateKey
                    await this.#save()
                    await sock.sendMessage(jid, {
                        text: `🔒 *JADWAL GRUP*\nGrup telah otomatis ditutup (Jadwal: ${String(sch.closeHour).padStart(2, "0")}:00 WIB). Selamat beristirahat semuanya! 🌙`
                    }).catch(() => {})
                } catch (e) {
                    console.error(`[group-open-close] gagal auto-close jadwal grup ${jid}`, e)
                }
            }
        }
    }

    /**
     * mulai background checker (sekali aja, tiap 1 menit). aman di panggil berkali kali,
     * cuma bakal beneran mulai sekali (di jaga pake #tickerStarted)
     */
    startTicker() {
        if (this.#tickerStarted) return
        this.#tickerStarted = true
        setInterval(() => this.#tick().catch(e => console.error(`[group-open-close] tick error`, e)), 60 * 1000)
    }

    async #save() {
        const data = {}
        for (const [jid, record] of this.#groups) {
            data[jid] = record
        }
        await mkdir(dirname(CONFIG_PATH), { recursive: true })
        await writeFile(CONFIG_PATH, JSON.stringify(data, null, 2))
    }

    async load() {
        try {
            const raw = await readFile(CONFIG_PATH, "utf-8")
            const parsed = JSON.parse(raw)
            const isValidShape = parsed && typeof parsed === "object" && !Array.isArray(parsed)
            if (!isValidShape) throw new Error("format config gak valid")

            this.#groups = new Map(Object.entries(parsed).map(([jid, record]) => [jid, {
                state: record?.state === GroupState.CLOSED ? GroupState.CLOSED : GroupState.OPEN,
                schedule: record?.schedule ?? null,
                lastTrigger: { open: record?.lastTrigger?.open ?? null, close: record?.lastTrigger?.close ?? null }
            }]))
        } catch (e) {
            console.warn(`[group-open-close-manager] gagal load config (${e.message}), pakai default (semua open, gak ada jadwal)`)
            this.#groups = new Map()
        }
    }
}

const groupOpenCloseManager = new GroupOpenCloseManager()
await groupOpenCloseManager.load()
groupOpenCloseManager.startTicker()

export { groupOpenCloseManager, GroupState }
