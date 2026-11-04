import fs from "node:fs/promises"
import path from "node:path"
import { allPaths } from "#root/src/all-paths.js"
import { JsonDb } from "#database/json-db.js"
import { db } from "#database/database.js"

const debugConfigDb = new JsonDb(allPaths.debugConfig, { isDebugActive: true })
await debugConfigDb.load()

const SKIP_DEEP_WALK = new Set(["node_modules", ".git"])

const ORIGINAL_CONSOLE = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
}

const NOOP = () => {}

const applyConsoleState = (active) => {
    if (active) {
        console.log = ORIGINAL_CONSOLE.log
        console.error = ORIGINAL_CONSOLE.error
        console.warn = ORIGINAL_CONSOLE.warn
        console.info = ORIGINAL_CONSOLE.info
        console.debug = ORIGINAL_CONSOLE.debug
    } else {
        console.log = NOOP
        console.error = NOOP
        console.warn = NOOP
        console.info = NOOP
        console.debug = NOOP
    }
}

const formatBytes = (byte) => {
    if (!byte) return "0 B"
    const units = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(byte) / Math.log(1024))
    const value = byte / Math.pow(1024, i)
    return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}

const getSizeRecursive = async (targetPath) => {
    try {
        const stat = await fs.stat(targetPath)
        if (stat.isFile()) return stat.size

        if (stat.isDirectory()) {
            const entries = await fs.readdir(targetPath)
            let total = 0
            for (const entry of entries) {
                total += await getSizeRecursive(path.join(targetPath, entry))
            }
            return total
        }
        return 0
    } catch {
        return 0
    }
}

class DebugManager {
    get isDebugActive() {
        return Boolean(debugConfigDb.data.isDebugActive)
    }

    async on() {
        if (this.isDebugActive) return { ok: false, message: `debug udah aktif kok sayang, gapapa gausah di apa apain lagi` }
        debugConfigDb.data.isDebugActive = true
        global.isDebugActive = true
        applyConsoleState(true)
        await debugConfigDb.save()
        return { ok: true, message: `debug mode udah aku nyalain yaa, console terminal nya nyala lagi` }
    }

    async off() {
        if (!this.isDebugActive) return { ok: false, message: `debug emang udah mati kok, gausah di matiin lagi` }
        debugConfigDb.data.isDebugActive = false
        global.isDebugActive = false
        await debugConfigDb.save()
        ORIGINAL_CONSOLE.log(`[DEBUG] debug mode di matiin, terminal output di bungkam (bot tetep jalan)`)
        applyConsoleState(false)
        return { ok: true, message: `debug mode udah aku matiin, terminal nya diem tapi tenang aja bot nya tetep jalan kok` }
    }

    async view() {
        const rootPath = allPaths.root
        const entries = await fs.readdir(rootPath, { withFileTypes: true })

        const rows = []
        let grandTotal = 0

        for (const entry of entries) {
            const fullPath = path.join(rootPath, entry.name)
            const size = await getSizeRecursive(fullPath)

            grandTotal += size
            rows.push({
                name: entry.name + (entry.isDirectory() ? "/" : ""),
                size
            })
        }

        rows.sort((a, b) => b.size - a.size)

        const body = rows
            .map(row => `${formatBytes(row.size).padStart(9)}  ${row.name}`)
            .join('\n')

        return `ini isi root folder bot kita, sayang\n${rootPath}\n\n${body}\n\ntotal: ${formatBytes(grandTotal)}`
    }

    async clear() {
        const before = await getSizeRecursive(allPaths.database)

        db.exec("VACUUM")

        const after = await getSizeRecursive(allPaths.database)

        let tempCleared = 0
        try {
            const tempEntries = await fs.readdir(allPaths.temp)
            for (const entry of tempEntries) {
                await fs.rm(path.join(allPaths.temp, entry), { recursive: true, force: true })
                tempCleared++
            }
        } catch {
            // folder temp emang belum tentu ada, aman di skip
        }

        return `udah aku beresin databasenya yaa\n\n` +
            `sqlite: ${formatBytes(before)} jadi ${formatBytes(after)}\n` +
            `temp file yang di hapus: ${tempCleared}`
    }
}

const debugManager = new DebugManager()
global.isDebugActive = debugManager.isDebugActive
applyConsoleState(debugManager.isDebugActive)

export { debugManager, formatBytes }