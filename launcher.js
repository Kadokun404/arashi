import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = fs.existsSync(path.join(__dirname, "package.json"))
    ? __dirname
    : path.resolve(__dirname, "..")

process.chdir(ROOT_DIR)

const UPTIME_FILE = path.join(ROOT_DIR, "data", "uptime.json")
const BOT_ENTRY = path.join(ROOT_DIR, "src", "bot.js")

function getOrInitStartTime() {
    try {
        if (fs.existsSync(UPTIME_FILE)) {
            const raw = JSON.parse(fs.readFileSync(UPTIME_FILE, "utf-8"))
            if (Number.isFinite(raw?.startTime) && raw.startTime > 0) {
                return raw.startTime
            }
        }
    } catch { }

    const now = Date.now()
    try {
        fs.mkdirSync(path.dirname(UPTIME_FILE), { recursive: true })
        fs.writeFileSync(UPTIME_FILE, JSON.stringify({ startTime: now }, null, 2))
    } catch { }
    return now
}

const LAUNCHER_START_TIME = getOrInitStartTime()
let child = null
let isShuttingDown = false

function startBot() {
    if (isShuttingDown) return

    console.log(`[LAUNCHER] menjalankan src/bot.js (startTime: ${new Date(LAUNCHER_START_TIME).toISOString()})`)

    child = spawn(process.execPath, [BOT_ENTRY], {
        cwd: ROOT_DIR,
        stdio: "inherit",
        env: {
            ...process.env,
            BOT_START_TIME: String(LAUNCHER_START_TIME),
            IS_LAUNCHED: "1"
        }
    })

    child.on("exit", (code, signal) => {
        child = null
        if (isShuttingDown) {
            console.log(`[LAUNCHER] bot.js berhenti karena sinyal shutdown (${signal || code})`)
            process.exit(0)
        }
        console.log(`[LAUNCHER] bot.js berhenti (code: ${code}, signal: ${signal}). Restart dalam 1 detik...`)
        setTimeout(startBot, 1000)
    })

    child.on("error", (err) => {
        console.error(`[LAUNCHER] gagal menjalankan bot.js:`, err)
    })
}

function handleShutdown(signal) {
    if (isShuttingDown) return
    isShuttingDown = true
    console.log(`[LAUNCHER] menerima ${signal}, mematikan child bot.js...`)
    if (child && !child.killed) {
        child.kill("SIGTERM")
        setTimeout(() => {
            if (child && !child.killed) child.kill("SIGKILL")
            process.exit(0)
        }, 3000).unref()
    } else {
        process.exit(0)
    }
}

process.on("SIGINT", () => handleShutdown("SIGINT"))
process.on("SIGTERM", () => handleShutdown("SIGTERM"))

startBot()
