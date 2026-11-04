/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { spawn, execFile } from "node:child_process"
import { promisify } from "node:util"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import zlib from "node:zlib"
import { DatabaseSync } from "node:sqlite"
import { downloadMediaMessage, normalizeMessageContent } from "baileys"
import { araManager } from "#manager/ara-manager.js"
import { askGemini } from "#helper/gemini.js"
import { handleGameAnswer, getActiveSession, bindGameSocket } from "#manager/game-manager.js"

const execFileAsync = promisify(execFile)

const LINE = "━━━━━━━━━━━━━━━━"
const BOT_LINK_PREFIX = "https://arashi.kadokun.com"
const MEDIA_DIR = path.join(process.cwd(), "temp", "ara-media")
fs.mkdirSync(MEDIA_DIR, { recursive: true })

const EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "application/json": ".json",
    "text/plain": ".txt",
    "text/javascript": ".js",
    "application/javascript": ".js",
    "text/html": ".html",
    "text/css": ".css",
    "text/csv": ".csv",
    "text/markdown": ".md",
    "video/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg"
}

function cleanupOldAraMedia() {
    try {
        if (!fs.existsSync(MEDIA_DIR)) return
        const now = Date.now()
        const maxAge = 6 * 60 * 60 * 1000
        for (const f of fs.readdirSync(MEDIA_DIR)) {
            const fp = path.join(MEDIA_DIR, f)
            try {
                const st = fs.statSync(fp)
                if (now - st.mtimeMs > maxAge) fs.rmSync(fp, { force: true })
            } catch {}
        }
    } catch {}
}

function getMediaInfo(msgObj) {
    if (!msgObj?.message) return null
    const norm = normalizeMessageContent(msgObj.message) || msgObj.message
    const types = ["imageMessage", "documentMessage", "videoMessage", "audioMessage", "stickerMessage"]
    for (const t of types) {
        if (norm?.[t]) {
            return { type: t, node: norm[t], normalizedMessage: norm }
        }
    }
    return null
}

function extractMsgText(msgObj) {
    if (!msgObj) return ""
    if (msgObj.text) return stripBotHeader(msgObj.text)
    const norm = normalizeMessageContent(msgObj.message) || msgObj.message
    const raw =
        norm?.conversation ||
        norm?.extendedTextMessage?.text ||
        norm?.imageMessage?.caption ||
        norm?.videoMessage?.caption ||
        norm?.documentMessage?.caption ||
        ""
    return stripBotHeader(raw)
}

async function downloadAttachment(msgObj, sourceLabel) {
    const info = getMediaInfo(msgObj)
    if (!info) return null

    cleanupOldAraMedia()
    const { type, node, normalizedMessage } = info
    let buf = null
    try {
        buf = await downloadMediaMessage(
            { key: msgObj.key, message: normalizedMessage },
            "buffer"
        )
    } catch {
        try {
            buf = await (msgObj.download?.("buffer") ?? msgObj.fullMessage?.download?.("buffer"))
        } catch {}
    }

    if (!buf) return null
    if (!Buffer.isBuffer(buf)) {
        const chunks = []
        for await (const c of buf) chunks.push(c)
        buf = Buffer.concat(chunks)
    }
    if (!buf.length) return null

    const mime = node.mimetype || "application/octet-stream"
    const cleanMime = mime.split(";")[0].trim().toLowerCase()
    let origName = node.fileName || ""
    if (!origName) {
        const defaultExt =
            EXT_BY_MIME[cleanMime] ||
            (type === "imageMessage"
                ? ".jpg"
                : type === "stickerMessage"
                ? ".webp"
                : type === "videoMessage"
                ? ".mp4"
                : type === "audioMessage"
                ? ".ogg"
                : ".bin")
        origName = `${type.replace(/Message$/, "")}${defaultExt}`
    }
    const safeBase = origName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80) || "file.bin"
    const savedPath = path.join(MEDIA_DIR, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeBase}`)
    fs.mkdirSync(MEDIA_DIR, { recursive: true })
    fs.writeFileSync(savedPath, buf)

    return {
        sourceLabel,
        mediaType: type,
        mimetype: mime,
        fileName: origName,
        sizeKB: (buf.length / 1024).toFixed(1),
        savedPath,
        caption: stripBotHeader(node.caption || "")
    }
}

const AGY_BIN = fs.existsSync("/home/ubuntu/.local/bin/agy")
    ? "/home/ubuntu/.local/bin/agy"
    : "agy"

const AGY_HOME_DIR = path.join(os.homedir(), ".gemini", "antigravity-cli")
const OAUTH_TOKEN_FILE = path.join(AGY_HOME_DIR, "antigravity-oauth-token")
const SETTINGS_FILE = path.join(AGY_HOME_DIR, "settings.json")
const SUMMARIES_DB_FILE = path.join(AGY_HOME_DIR, "conversation_summaries.db")
const CONVERSATIONS_DIR = path.join(AGY_HOME_DIR, "conversations")

const DATA_DIR = path.join(process.cwd(), "data")
const SESSION_FILE = path.join(DATA_DIR, "agy.json")
fs.mkdirSync(DATA_DIR, { recursive: true })

const DEFAULT_MODEL = "gemini-4-argon-medium"
const DEFAULT_EFFORT = "medium"
const DEFAULT_MODE = "auto"

const AVAILABLE_MODELS = [
    { id: "gemini-4-argon-medium", label: "Gemini 4 Argon (Medium)" },
    { id: "gemini-4-argon-high", label: "Gemini 4 Argon (High)" },
    { id: "gemini-4-argon-low", label: "Gemini 4 Argon (Low)" },
    { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
    { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" },
    { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)" },
    { id: "claude-opus-5-5-high", label: "Claude Opus 5.5 (High)" },
    { id: "claude-opus-5-5-medium", label: "Claude Opus 5.5 (Medium)" },
    { id: "claude-opus-5-5-low", label: "Claude Opus 5.5 (Low)" },
    { id: "claude-sonnet-5-5-high", label: "Claude Sonnet 5.5 (High)" },
    { id: "claude-sonnet-5-5-medium", label: "Claude Sonnet 5.5 (Medium)" },
    { id: "claude-sonnet-5-5-low", label: "Claude Sonnet 5.5 (Low)" },
    { id: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" }
]

const VALID_EFFORTS = ["low", "medium", "high", "xhigh", "max"]
const VALID_MODES = ["auto", "accept-edits", "plan"]

// Store sesi per user di data/agy.json (seperti data/gemini.json)
let store = {}
try {
    store = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"))
} catch {
    store = {}
}
const saveStore = () => {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true })
        fs.writeFileSync(SESSION_FILE, JSON.stringify(store, null, 2))
    } catch (e) {
        console.error("[ara/agy] gagal simpan sesi:", e)
    }
}

function getUserState(user) {
    if (!store[user] || typeof store[user] !== "object") {
        store[user] = {
            conversationId: "",
            model: DEFAULT_MODEL,
            effort: DEFAULT_EFFORT,
            mode: DEFAULT_MODE,
            initializedConversations: {}
        }
    }
    if (!store[user].model) store[user].model = DEFAULT_MODEL
    if (!store[user].effort) store[user].effort = DEFAULT_EFFORT
    if (!store[user].mode) store[user].mode = DEFAULT_MODE
    if (!store[user].initializedConversations) store[user].initializedConversations = {}
    return store[user]
}

// Melacak message ID yang dikirim oleh Ara supaya reply tanpa command otomatis nyambung (persist lintas reload)
const araMessageIds = (globalThis.__araMessageIds ??= new Set())
function trackMsgId(id) {
    if (!id) return
    araMessageIds.add(id)
    if (araMessageIds.size > 500) {
        const first = araMessageIds.values().next().value
        araMessageIds.delete(first)
    }
}

export function isAraMessage(id) {
    return Boolean(id && araMessageIds.has(id))
}

async function sendAraRep(m, text) {
    const msgId = await m.arashirep(text)
    trackMsgId(msgId)
    return msgId
}

const pfpThumbCache = (globalThis.__araPfpThumbCache ??= new Map())
const PFP_CACHE_TTL = 10 * 60 * 1000
const FALLBACK_THUMBNAIL = Buffer.from(
    "/9j/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAEsASwDASIAAhEBAxEB/8QAGgABAAMBAQEAAAAAAAAAAAAAAAMEBQIBB//EAC0QAQACAQIFAgYCAgMAAAAAAAABAgMEERIhMUFRInETMkJSYYEUkSOhMzRD/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAEC/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEB/9oADAMBAAIRAxEAPwD7MA0wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOq0tedqxMylwaa2Wd55VaFMdcddqxslXMU8ehmed7bfiE9dJijrXf3TiVYjjBij6IJ0+KetISAqtbRY7dN6q2TSZKc49UfhpBUjGGlm01csbxyt5Z96Wx24bRzVI5AVAAAAAAAAAAAAAAAAAAAAAABNp8Hxb8/ljqiiJmYiO7VxY4xY4rH7TVx1ERWIiI2iHoI0AAAAAAIs+GM1Nu8dJSgMe1ZraYnrDxd1uLpkj2lSaZABAAAAAAAAAAAAAAAAAAAAAFjR04s2/wBvNoqmhr6LW/Oy2mtYAIoAAAAAAADnJXjx2r5hkzG0zHhsMrUV4c9oXE1GArIAAAAAAAAAAAAAAAAAAAAADQ0X/BPusquhn/HMflaZawAFAAAAAAAAGbq/+zb9NJl6meLUWlcTUQCsgAAAAAAAAAAAAAAAAAAAAALOivw5Zr5hoMilppeLR2atLRekWjpKa1joBFAAAAAAAAeWtw1m09oZFp4rTPmV7WZeGnBHWVBcZ0AVAAAAAAAAAAAAAAAAAAAAAABa0mfgngtPpnoqgrZFLT6rbamSeXaV2JiY3hloAAAAAAc5LxjpNrPMmWuKu9p/TOzZrZrbzyjtAm65yZJyXm0uAaZAAAAAAAAAAAAAAAAAAAAAAAAAAEuLUXxdJ3jxKIBoY9Zjt83plPGSlulo/tkETMdEi1s7x5ebxHeGTx3+6f7ecVp62n+yLWpbPjp1tH6V8mt7Y4/cqQRK6te153tO8uQVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd1w5L/LSZTV0WWeu0CqwuxofN5dRoafdMpSKA0P4WP8n8LH5kpGeL06Gva8x+nFtDP0239ykVBPbSZa9t/ZDatqz6omPdR4AIAAAAAAAAAAAAAAAAAAAAAAPa1m07RG8p8Oltk525VXseKmONqxslWKePRWnnedo8LVNPjx9K8/KURYbbACgAAAAADyaxbrES9AV8mjx2+X0z+FTJpsmPntvHmGmFSMYaWXS0yc49NlDJivittaP2qRwAqAAAAAAAAAAAAAAAERvO0AREzO0dV7T6WK7WyRvPaPDrTaeMccdvmn/SylazABFAAAAAAAAAAAAAAHN6VvXhtG8OgGbn082pc1jnVA2JiLRtMbwztRp5xW3j5Z/0tZ3EACoAAAAAAAAAAAALmkwf+lo9kGDF8XLEdu7TiIiIiOkJq5j0BGgAAAAAAAAAAAAAAAAAB5asXrNZjlL0BlZsU4sk17dkbT1OL4uOfMc4ZnRWdAFQAAAAAAAAAB3iy2xX4qtLDmrmrvHXvDKdUvaluKs7Si5rXFbBq63ja/KyyjQAAAAAAAAAAAAAAAAAAPLXrSu9p2hQz6ub71pyr5CpdRq4rvSnOe8qM853BpkAEAAAAAAAAAAAAFjDqr4+U+qquCtXHmplj0zz8JGNEzE7xKzj1l6creqEi1oCHHqcd++0+JTb7ooAAAAAAAAAAPLXrWN7TEK2TW0ryrHFILUztHNWy6ulOVfVKnkz5MnWeXiEaxmu8mW+Sd7T+nAKgAAAAAAAAAAAAAAAAAAAA7plvT5bTDgBarrbx80RKWuupPWswoCRa041WGfr2dRnxT0vDKCFa3xafdB8XH90MkIVqTqMUdbw5tq8UdJ39maEKu210fTSf2hvq8tuk8PsgAr21rWneZmXgKgAAAAAAAAAAAD/9k=",
    "base64"
)

async function getThumb(sock, jid) {
    const cached = pfpThumbCache.get(jid)
    if (cached && Date.now() - cached.time < PFP_CACHE_TTL) return cached.buffer
    try {
        const url = await sock.profilePictureUrl(jid, "preview")
        const res = await fetch(url)
        if (!res.ok) throw new Error(`http ${res.status}`)
        const buffer = Buffer.from(await res.arrayBuffer())
        pfpThumbCache.set(jid, { buffer, time: Date.now() })
        return buffer
    } catch {
        pfpThumbCache.set(jid, { buffer: null, time: Date.now() })
        return null
    }
}

async function editAraRep(ctx, msgId, text) {
    const { sock, jid, m } = ctx
    const id = typeof msgId === "object" ? (msgId?.key?.id || msgId?.id) : String(msgId || "")
    if (!id) return await sendAraRep(m, text)

    trackMsgId(id)
    try {
        const senderJid = m.sender || m.key?.participant || m.key?.remoteJid || jid
        const thumb = (await getThumb(sock, senderJid)) || FALLBACK_THUMBNAIL
        const body = String(text).includes(BOT_LINK_PREFIX) ? text : `${BOT_LINK_PREFIX}\n\n${text}`

        const sent = await sock.sendMessage(jid, {
            text: body,
            linkPreview: {
                "matched-text": BOT_LINK_PREFIX,
                title: m.contact?.name || "Arashi",
                description: "Arashi",
                jpegThumbnail: thumb
            },
            edit: {
                remoteJid: jid,
                fromMe: true,
                id
            }
        })
        trackMsgId(sent?.key?.id)
        return id
    } catch (e) {
        console.error("[ara/agy] gagal edit pesan, fallback kirim baru:", e)
        return await sendAraRep(m, text)
    }
}

function formatToolStatus(su) {
    const rawTool = su?.tool_name || su?.tool_info?.name || "tool"
    const params = su?.tool_info?.parameters || {}
    const oneLine = (s, max = 90) => {
        const clean = String(s || "").replace(/\s+/g, " ").trim()
        if (!clean) return "..."
        return clean.length > max ? clean.slice(0, max) + "..." : clean
    }

    if (rawTool === "run_command" || rawTool === "send_command_input" || rawTool === "command_status") {
        const cmd = params.CommandLine || params.toolSummary || params.Input || "..."
        return `shikou no jikkou: ${oneLine(cmd)}`
    }
    if (rawTool === "view_file" || rawTool === "read_file") {
        const p = params.Path || params.FilePath || params.file_path || ""
        const target = p ? path.basename(p) || p : "..."
        return `shikou no jikkou: read ${oneLine(target)}`
    }
    if (rawTool === "edit_file" || rawTool === "replace_file_content" || rawTool === "multi_replace_file_content" || rawTool === "sed_file") {
        const p = params.Path || params.TargetFile || params.file_path || ""
        const target = p ? path.basename(p) || p : "..."
        return `shikou no jikkou: edit ${oneLine(target)}`
    }
    if (rawTool === "write_to_file" || rawTool === "write_file" || rawTool === "create_file") {
        const p = params.Path || params.TargetFile || params.file_path || ""
        const target = p ? path.basename(p) || p : "..."
        return `shikou no jikkou: write ${oneLine(target)}`
    }
    if (rawTool === "grep_search") {
        const q = params.Query || params.query || "..."
        return `shikou no jikkou: grep ${oneLine(q)}`
    }
    if (rawTool === "find_by_name" || rawTool === "list_dir") {
        const q = params.Pattern || params.DirectoryPath || params.Path || "..."
        return `shikou no jikkou: find ${oneLine(q)}`
    }
    if (rawTool === "search_web" || rawTool === "read_url_content") {
        const q = params.query || params.Url || params.url || "..."
        return `shikou no jikkou: web ${oneLine(q)}`
    }
    const firstVal = Object.values(params).find(v => typeof v === "string" && v.trim()) || "..."
    return `shikou no jikkou: ${rawTool} ${oneLine(firstVal)}`
}

// Melacak proses agy yang sedang berjalan per user & proses login OAuth
const runningProcesses = new Map()
let pendingLogin = null

const cleanName = n => String(n || "").replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)

// Format Markdown ke format WhatsApp dengan menjaga blok kode ```...```
function fmtSegment(t) {
    return String(t)
        .replace(/^\s*https?:\/\/(?:[\w-]+\.)?googleusercontent\.com\/\S*\s*$/gim, "")
        .replace(/https?:\/\/(?:[\w-]+\.)?googleusercontent\.com\/\S*/gi, "")
        .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, LINE)
        .replace(/^#{1,6}\s*(.+)$/gm, (_, h) => `*${h.replace(/\*/g, "").trim()}*`)
        .replace(/^( {4,}|\t+)[*-]\s+/gm, "    ◦ ")
        .replace(/^\s{0,3}[*-]\s+/gm, "• ")
        .replace(/\*\*(.+?)\*\*/g, "*$1*")
        .replace(/\[([^\]]+)\]\(file:\/\/[^)]+\)/g, "`$1`")
        .replace(/\[([^\]]+)\]\(conversation:\/\/[^)]+\)/g, "`$1`")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
        .replace(/[ \t]+$/gm, "")
}

function fmt(text) {
    const raw = String(text || "")
    const parts = raw.split(/(```[\s\S]*?```)/g)
    return parts
        .map(part => (part.startsWith("```") && part.endsWith("```") ? part : fmtSegment(part)))
        .join("")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

function stripBotHeader(text) {
    if (!text) return ""
    return String(text)
        .replace(/^https?:\/\/arashi\.kadokun\.com\s*/i, "")
        .trim()
}

function getAccountInfo() {
    try {
        if (!fs.existsSync(OAUTH_TOKEN_FILE)) {
            return { loggedIn: false }
        }
        const raw = JSON.parse(fs.readFileSync(OAUTH_TOKEN_FILE, "utf8"))
        const expiryStr = raw?.token?.expiry
        const expiryDate = expiryStr ? new Date(expiryStr) : null
        const isExpired = expiryDate ? expiryDate.getTime() <= Date.now() : false
        return {
            loggedIn: Boolean(raw?.token?.access_token || raw?.token?.refresh_token),
            email: raw?.id_token_email || "-",
            authMethod: raw?.auth_method || "consumer",
            expiry: expiryDate ? expiryDate.toLocaleString("id-ID", { timeZone: "Asia/Makassar" }) + " WITA" : "-",
            isExpired,
            hasRefreshToken: Boolean(raw?.token?.refresh_token)
        }
    } catch (e) {
        return { loggedIn: false, error: e.message }
    }
}

function getSettings() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) return {}
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"))
    } catch {
        return {}
    }
}

function saveSettings(settings) {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
}

function getRecentConversations(limit = 10) {
    try {
        if (!fs.existsSync(SUMMARIES_DB_FILE)) return []
        const db = new DatabaseSync(SUMMARIES_DB_FILE, { open: true, readOnly: true })
        const rows = db.prepare(`
            SELECT conversation_id, title, step_count, last_modified_time, status
            FROM conversation_summaries
            WHERE parent_conversation_id = ''
            ORDER BY last_modified_time DESC
            LIMIT ?
        `).all(limit)
        db.close()
        return rows
    } catch (e) {
        console.error("[ara/agy] gagal baca conversation_summaries.db:", e)
        return []
    }
}

function getConversationSummary(conversationId) {
    if (!conversationId) return null
    try {
        if (!fs.existsSync(SUMMARIES_DB_FILE)) return null
        const db = new DatabaseSync(SUMMARIES_DB_FILE, { open: true, readOnly: true })
        const row = db.prepare(`
            SELECT conversation_id, title, step_count, last_modified_time, status
            FROM conversation_summaries
            WHERE conversation_id = ?
        `).get(conversationId)
        db.close()
        return row || null
    } catch {
        return null
    }
}

function extractAuthCode(input) {
    const trimmed = String(input || "").trim()
    if (!trimmed) return ""
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        try {
            const u = new URL(trimmed)
            const code = u.searchParams.get("code")
            if (code) return code.trim()
        } catch {}
    }
    const matchCodeParam = trimmed.match(/[?&]code=([^&\s]+)/)
    if (matchCodeParam) {
        try {
            return decodeURIComponent(matchCodeParam[1]).trim()
        } catch {
            return matchCodeParam[1].trim()
        }
    }
    return trimmed
}

function cleanupPendingLogin() {
    if (!pendingLogin) return
    const current = pendingLogin
    pendingLogin = null
    if (current.timer) clearTimeout(current.timer)
    try {
        if (current.proc && !current.proc.killed) {
            current.proc.kill("SIGKILL")
        }
    } catch {}
    try {
        if (current.stagingDir && fs.existsSync(current.stagingDir)) {
            fs.rmSync(current.stagingDir, { recursive: true, force: true })
        }
    } catch {}
}

async function startOAuthLoginFlow(ctx) {
    const { m } = ctx
    cleanupPendingLogin()

    const stagingDir = path.join(process.cwd(), "temp", `agy-login-${Date.now()}`)
    const stagingAgyDir = path.join(stagingDir, ".gemini", "antigravity-cli")
    fs.mkdirSync(stagingAgyDir, { recursive: true })

    for (const fname of ["settings.json", "jetski_state.pbtxt", "installation_id"]) {
        const src = path.join(AGY_HOME_DIR, fname)
        const dest = path.join(stagingAgyDir, fname)
        if (fs.existsSync(src)) {
            try {
                fs.copyFileSync(src, dest)
            } catch {}
        }
    }

    const tokenPath = path.join(stagingAgyDir, "antigravity-oauth-token")
    const logPath = path.join(stagingDir, "auth.log")

    return new Promise((resolve) => {
        const cmd = `${AGY_BIN} -p hi --log-file ${logPath}`
        const proc = spawn("script", ["-qfc", cmd, "/dev/null"], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                HOME: stagingDir
            },
            stdio: ["pipe", "pipe", "pipe"]
        })

        let buffer = ""
        let resolvedUrl = false

        const timer = setTimeout(() => {
            if (!resolvedUrl) {
                resolvedUrl = true
                cleanupPendingLogin()
                resolve({ ok: false, error: "Timeout saat meminta link login dari Antigravity CLI." })
            } else {
                cleanupPendingLogin()
            }
        }, 65000)

        const onData = (chunk) => {
            buffer += chunk.toString("utf8")
            const clean = buffer.replace(/\r/g, "")
            const urlMatch = clean.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/auth\S+/)
            if (!resolvedUrl && urlMatch) {
                resolvedUrl = true
                const loginUrl = urlMatch[0].trim()
                pendingLogin = {
                    proc,
                    stagingDir,
                    tokenPath,
                    logPath,
                    timer,
                    getOutput: () => buffer
                }
                resolve({ ok: true, url: loginUrl })
            }
        }

        proc.stdout.on("data", onData)
        proc.stderr.on("data", onData)

        proc.on("exit", () => {
            if (!resolvedUrl) {
                resolvedUrl = true
                cleanupPendingLogin()
                resolve({ ok: false, error: `Proses login berhenti sebelum link keluar.\nOutput: ${buffer.slice(0, 300)}` })
            }
        })
    })
}

async function submitOAuthCode(rawInput) {
    if (!pendingLogin) {
        return {
            ok: false,
            message: "❌ Tidak ada sesi login yang sedang menunggu kode. Ketik *ara login* terlebih dahulu untuk meminta link login baru."
        }
    }

    const code = extractAuthCode(rawInput)
    if (!code) {
        return {
            ok: false,
            message: "❌ Kode otorisasi kosong. Kirimkan kode atau URL callback dari halaman login Google."
        }
    }

    const current = pendingLogin
    try {
        current.proc.stdin.write(`${code}\r\n`)
    } catch (e) {
        cleanupPendingLogin()
        return {
            ok: false,
            message: `❌ Gagal mengirim kode ke proses login: ${e.message}. Silakan ulangi *ara login*.`
        }
    }

    const start = Date.now()
    while (Date.now() - start < 20000) {
        await new Promise(r => setTimeout(r, 400))

        if (fs.existsSync(current.tokenPath)) {
            try {
                const rawToken = fs.readFileSync(current.tokenPath, "utf8")
                const parsed = JSON.parse(rawToken)
                if (parsed?.token?.access_token || parsed?.token?.refresh_token) {
                    fs.mkdirSync(AGY_HOME_DIR, { recursive: true })
                    fs.copyFileSync(current.tokenPath, OAUTH_TOKEN_FILE)
                    try {
                        fs.chmodSync(OAUTH_TOKEN_FILE, 0o600)
                    } catch {}
                    cleanupPendingLogin()
                    const info = getAccountInfo()
                    return {
                        ok: true,
                        message:
                            `✅ *LOGIN ANTIGRAVITY BERHASIL*\n${LINE}\n` +
                            `• Email  : ${info.email}\n` +
                            `• Metode : ${info.authMethod}\n` +
                            `• Expiry : ${info.expiry}`
                    }
                }
            } catch {}
        }

        const out = current.getOutput()
        if (out.includes("Error: authentication failed:") || out.includes("invalid_grant") || out.includes("Malformed auth code")) {
            const errLine = out.split(/\r?\n/).find(l => l.includes("Error: authentication failed:")) || "Kode otorisasi tidak valid atau sudah kedaluwarsa."
            cleanupPendingLogin()
            return {
                ok: false,
                message: `❌ *LOGIN GAGAL*\n${LINE}\n${errLine.trim()}\n\nKetik *ara login* untuk membuat link baru.`
            }
        }
    }

    // Cek apakah ada pesan ineligible / validation_url di log
    let extraInfo = ""
    try {
        if (fs.existsSync(current.logPath)) {
            const logText = fs.readFileSync(current.logPath, "utf8")
            const valMatch = logText.match(/"validation_url":\s*"([^"]+)"/)
            if (valMatch) {
                extraInfo = `\n\n⚠️ Akun membutuhkan verifikasi akses:\n${valMatch[1]}`
            }
        }
    } catch {}

    cleanupPendingLogin()
    return {
        ok: false,
        message: `❌ *LOGIN TIMEOUT / GAGAL*\n${LINE}\nToken tidak terbentuk dalam batas waktu.${extraInfo}\n\nKetik *ara login* untuk mencoba lagi.`
    }
}

async function fetchAgyQuota() {
    try {
        const { stdout } = await execFileAsync(AGY_BIN, ["-p", "/quota"], { timeout: 15000 })
        const lines = stdout
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && !l.toLowerCase().startsWith("quota:"))

        if (!lines.length) return null

        return lines.map((line) => {
            const parts = line.split("\t").map((p) => p.trim())
            return {
                category: parts[0] || "-",
                limitType: parts[1] || "-",
                remaining: parts[2] || "0%",
                resetTime: parts[3] || null
            }
        })
    } catch {
        return null
    }
}

function makeQuotaBar(percentStr) {
    const v = parseInt(percentStr, 10) || 0
    const filled = Math.min(10, Math.max(0, Math.round((v / 100) * 10)))
    return "█".repeat(filled) + "░".repeat(10 - filled)
}

function formatWibDate(isoStr) {
    if (!isoStr) return "-"
    try {
        const d = new Date(isoStr)
        return (
            d.toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            }) + " WIB"
        )
    } catch {
        return isoStr
    }
}

function getAgentStatus(user) {
    const activeProc = runningProcesses.get(user)
    if (activeProc && !activeProc.killed) {
        const elapsedSec = Math.floor((Date.now() - (activeProc.startedAt || Date.now())) / 1000)
        const preview = activeProc.promptPreview ? ` ("${activeProc.promptPreview}")` : ""
        return `⚡ Working (${elapsedSec}s)${preview}`
    }
    return "🟢 Free (Siap Menerima Perintah)"
}

function buildMenu(user) {
    const state = getUserState(user)
    const acc = getAccountInfo()
    const summary = getConversationSummary(state.conversationId)
    const activeSessionLabel = state.conversationId
        ? `${state.conversationId.slice(0, 8)}... (${summary?.title || "Sesi Aktif"})`
        : "Baru (belum ada sesi)"

    return (
        `ARASHI (ANTIGRAVITY AGENT)\n${LINE}\n` +
        `• Status : ${getAgentStatus(user)}\n` +
        `• Akun   : ${acc.loggedIn ? `${acc.email} ✅` : "Belum Login ❌"}\n` +
        `• Model  : ${state.model}\n` +
        `• Effort : ${state.effort} | Mode: ${state.mode}\n` +
        `• Sesi   : ${activeSessionLabel}\n` +
        `${LINE}\n` +
        `*PERCAKAPAN & SESI*\n` +
        `• ara <perintah>     suruh / tanya Ara\n` +
        `• (reply pesan bot)  lanjut perintah tanpa ketik ara\n` +
        `• ara reset          hapus sesi, mulai baru\n` +
        `• ara -e [nama]      export sesi jadi file\n` +
        `• ara -r [id/nomor]  import file sesi / pindah sesi\n` +
        `• ara sesi           lihat daftar sesi percakapan\n` +
        `• ara stop           hentikan proses yang berjalan\n\n` +
        `*AKUN & TOOLS AGY*\n` +
        `• ara akun           cek detail akun & status CLI\n` +
        `• ara kuota          cek sisa kuota model & limit real-time\n` +
        `• ara login          minta link login Google OAuth\n` +
        `• ara code <kode>    masukkan kode/URL hasil login\n` +
        `• ara logout         keluar dari akun saat ini\n` +
        `• ara model [nama]   lihat / ganti model AI\n` +
        `• ara effort [level] atur effort (low..max)\n` +
        `• ara mode [mode]    atur mode (auto|accept-edits|plan)\n` +
        `• ara remote [...]   kelola remote-control daemon\n` +
        `• ara mcp [...]      kelola MCP server\n` +
        `• ara plugin [...]   kelola plugin AGY\n` +
        `• ara workspace      kelola trusted workspace`
    )
}

function buildPersonaContext() {
    return (
        `[Konteks Sistem: Kamu adalah Arashi (biasa dipanggil Ara), asisten AI & agentic coding (Google Antigravity) ` +
        `yang terhubung langsung ke bot WhatsApp milik Kado (Owner) di workspace /home/ubuntu/bot. ` +
        `Jawab menggunakan bahasa Indonesia yang natural, hangat, dan to-the-point agar nyaman dibaca di WhatsApp. ` +
        `Kamu memiliki akses penuh ke file dan terminal untuk mengeksekusi perintah Kado.\n` +
        `PENTING TENTANG REQUEST LAGU/MUSIK: Jika Kado meminta lagu (misal "mau lagu...", "putar lagu...", "dengerin lagu..."), ` +
        `JANGAN jalankan perintah bash/terminal yang tidak perlu atau bertele-tele. Langsung berikan info lagu singkat (Judul & Artis) ` +
        `dan kirim lagunya menggunakan tag [[CMD: play <judul lagu>]] atau [[AUDIO: /path/file.mp3 | <judul>.mp3]]. ` +
        `Hanya tampilkan eksekusi bash/coding jika Kado memang meminta edit/tambah/hapus kode.\n` +
        `Fitur Aksi WhatsApp: Jika Kado meminta memutar lagu, menjalankan fitur/plugin bot, atau mengirim media ke chat WA, ` +
        `kamu bisa menyertakan tag berikut di dalam balasanmu (tag akan otomatis dieksekusi oleh bot dan dihapus dari teks):\n` +
        `- [[CMD: play judul lagu]] -> menjalankan command plugin bot (contoh: play, yp, tiktok, sticker, dll)\n` +
        `- [[AUDIO: /path/file.mp3 | Judul.mp3]] -> mengirim file audio ke WA\n` +
        `- [[IMAGE: /path/atau/url.jpg | Caption]] -> mengirim gambar ke WA\n` +
        `- [[DOC: /path/file | namafile.ext | Caption]] -> mengirim dokumen ke WA]\n\n`
    )
}

function parseAraActions(rawText) {
    const actions = []
    const cleaned = String(rawText || "").replace(
        /\[\[\s*(CMD|AUDIO|VIDEO|IMAGE|DOC)\s*:\s*([^\]]+?)\s*\]\]/gi,
        (_, type, payload) => {
            actions.push({
                type: type.toUpperCase(),
                parts: payload.split("|").map(s => s.trim())
            })
            return ""
        }
    )
    return { cleaned: cleaned.replace(/\n{3,}/g, "\n\n").trim(), actions }
}

async function runAraActions(ctx, actions) {
    const { sock, jid, m, pluginManager } = ctx
    for (const act of actions) {
        try {
            if (act.type === "CMD") {
                const rawCmd = act.parts.join(" ").trim()
                const [cmdName = "", ...rest] = rawCmd.split(/\s+/)
                const lowerCmd = cmdName.toLowerCase()
                const targetPlugin = pluginManager?.pluginMap?.get(lowerCmd)
                if (targetPlugin?.run) {
                    const subCtx = {
                        ...ctx,
                        command: lowerCmd,
                        text: rest.join(" ").trim()
                    }
                    await targetPlugin.run(subCtx)
                }
            } else if (act.type === "VIDEO") {
                const [target, caption] = act.parts
                if (target) {
                    const videoPayload = /^https?:\/\//i.test(target)
                        ? { url: target }
                        : (fs.existsSync(target) ? fs.readFileSync(target) : null)
                    if (videoPayload) {
                        const sent = await sock.sendMessage(jid, {
                            video: videoPayload,
                            mimetype: "video/mp4",
                            ...(caption ? { caption } : {})
                        }, { quoted: m })
                        trackMsgId(sent?.key?.id)
                    }
                }
            } else if (act.type === "AUDIO") {
                const [filePath, fileName] = act.parts
                if (filePath && fs.existsSync(filePath)) {
                    const sent = await sock.sendMessage(jid, {
                        audio: fs.readFileSync(filePath),
                        mimetype: "audio/mp4",
                        ptt: false,
                        fileName: fileName || path.basename(filePath)
                    }, { quoted: m })
                    trackMsgId(sent?.key?.id)
                }
            } else if (act.type === "IMAGE") {
                const [target, caption] = act.parts
                if (target) {
                    const imagePayload = /^https?:\/\//i.test(target)
                        ? { url: target }
                        : (fs.existsSync(target) ? fs.readFileSync(target) : null)
                    if (imagePayload) {
                        const sent = await sock.sendMessage(jid, {
                            image: imagePayload,
                            ...(caption ? { caption } : {})
                        }, { quoted: m })
                        trackMsgId(sent?.key?.id)
                    }
                }
            } else if (act.type === "DOC") {
                const [filePath, fileName, caption] = act.parts
                if (filePath && fs.existsSync(filePath)) {
                    const sent = await sock.sendMessage(jid, {
                        document: fs.readFileSync(filePath),
                        mimetype: "application/octet-stream",
                        fileName: fileName || path.basename(filePath),
                        ...(caption ? { caption } : {})
                    }, { quoted: m })
                    trackMsgId(sent?.key?.id)
                }
            }
        } catch (e) {
            console.error(`[ara/agy] gagal menjalankan action ${act.type}:`, e)
        }
    }
}

async function executeAgyTurn(ctx, promptText, quotedText = "") {
    const { m } = ctx
    const user = m.sender || m.key?.participant || ctx.jid
    const state = getUserState(user)

    if (runningProcesses.has(user)) {
        return await sendAraRep(
            m,
            `⏳ Ara masih mengerjakan perintah sebelumnya. Tunggu sebentar atau ketik *ara stop* untuk membatalkan.`
        )
    }

    const acc = getAccountInfo()
    if (!acc.loggedIn) {
        return await sendAraRep(
            m,
            `❌ Akun Antigravity belum login.\nKetik *ara login* untuk mendapatkan link login Google OAuth.`
        )
    }

    let statusMsgId = null

    const attachments = []
    if (getMediaInfo(ctx.q) || getMediaInfo(m)) {
        if (ctx.q && getMediaInfo(ctx.q)) {
            const qAtt = await downloadAttachment(ctx.q, "Pesan yang di-reply")
            if (qAtt) attachments.push(qAtt)
        }
        if (getMediaInfo(m)) {
            const mAtt = await downloadAttachment(m, "Pesan saat ini")
            if (mAtt) attachments.push(mAtt)
        }
    }

    const isFirstTurnInSession = !state.conversationId || !state.initializedConversations?.[state.conversationId]
    let fullPrompt = ""

    if (isFirstTurnInSession) {
        fullPrompt += buildPersonaContext()
    }
    if (state.mode === "plan") {
        fullPrompt += `[Mode: PLAN — Buat rencana terstruktur terlebih dahulu sebelum mengubah file jika tugasnya kompleks.]\n\n`
    }
    if (ctx.q || quotedText) {
        const qSender = ctx.q?.key?.fromMe
            ? "Arashi (Bot)"
            : (ctx.q?.name || ctx.q?.contact?.name || ctx.q?.sender || "User")
        const qText = quotedText || extractMsgText(ctx.q)
        if (qText) {
            fullPrompt += `[Pesan yang di-reply (Pengirim: ${qSender})]:\n"""\n${qText}\n"""\n\n`
        } else if (ctx.q) {
            fullPrompt += `[Pesan yang di-reply (Pengirim: ${qSender}, Tipe: ${ctx.q.content || "media"})]\n\n`
        }
    }
    if (attachments.length) {
        const attLines = attachments.map((a, idx) =>
            `${idx + 1}. Sumber: ${a.sourceLabel} | Tipe: ${a.mediaType} (${a.mimetype}) | Nama: ${a.fileName} (${a.sizeKB} KB)\n` +
            `   Path Lokal: ${a.savedPath}`
        ).join("\n")
        fullPrompt +=
            `[Lampiran File/Media Terdeteksi — Sudah diunduh ke disk lokal. WAJIB gunakan tool read_file pada Path Lokal di bawah ini untuk melihat gambar / membaca isi dokumen/file sebelum menjawab]:\n` +
            `${attLines}\n\n`
    }
    fullPrompt += promptText || (attachments.length ? "Tolong baca/lihat dan analisis lampiran file atau gambar ini." : "Tolong tanggapi pesan yang di-reply ini.")

    const args = [
        "-p",
        fullPrompt,
        "--output-format",
        "stream-json",
        "--dangerously-skip-permissions",
        "--disable-slash-commands",
        "--model",
        state.model || DEFAULT_MODEL
    ]

    const activeModel = state.model || DEFAULT_MODEL
    if (!/-(low|medium|high)$/.test(activeModel)) {
        args.push("--effort", state.effort || DEFAULT_EFFORT)
    }

    if (state.conversationId) {
        args.push("--conversation", state.conversationId)
    }

    return new Promise((resolve) => {
        const child = spawn(AGY_BIN, args, {
            cwd: process.cwd(),
            env: { ...process.env },
            stdio: ["ignore", "pipe", "pipe"]
        })

        child.startedAt = Date.now()
        child.promptPreview = promptText ? (promptText.length > 40 ? promptText.slice(0, 40) + "..." : promptText) : "Perintah Antigravity"
        runningProcesses.set(user, child)

        let stdoutBuf = ""
        let stderrBuf = ""
        let streamedText = ""
        let finalResponse = ""
        let detectedConvId = state.conversationId || ""
        let wasCancelled = false
        let logFileHint = ""
        let turnFinished = false
        let lastStatusText = ""
        let pendingStatusText = ""
        let statusEditInFlight = false
        let statusCooldownTimer = null
        let editChain = Promise.resolve()

        const sendOrEditFinal = async (text) => {
            if (statusMsgId) {
                return await editAraRep(ctx, statusMsgId, text)
            }
            return await sendAraRep(m, text)
        }

        const flushStatusEdit = () => {
            if (turnFinished || statusEditInFlight || !pendingStatusText || pendingStatusText === lastStatusText) {
                return
            }
            const nextText = pendingStatusText
            pendingStatusText = ""
            lastStatusText = nextText
            statusEditInFlight = true

            editChain = editChain
                .then(async () => {
                    if (!statusMsgId) {
                        statusMsgId = await sendAraRep(m, nextText)
                    } else {
                        await editAraRep(ctx, statusMsgId, nextText)
                    }
                })
                .catch(() => {})
                .finally(() => {
                    statusEditInFlight = false
                    if (!turnFinished && pendingStatusText && pendingStatusText !== lastStatusText) {
                        statusCooldownTimer = setTimeout(() => {
                            statusCooldownTimer = null
                            flushStatusEdit()
                        }, 350)
                    }
                })
        }

        const promptLower = String(promptText || "").toLowerCase()
        const isMusicRequest = /(?:lagu|dengerin|putar(?:kan)?|play\s|musik|nyanyi|song)/i.test(promptLower)
        const isCodeTask = !isMusicRequest && /(?:edit|tambah|hapus|fix|bikin|buat\s+fitur|coding|koding|script|plugin|code|kode|file|debug|upgrade|patch|refactor|eror|error|bash|shell|terminal|git)/i.test(promptLower)
        const shouldShowStatus = isCodeTask

        const queueStatusEdit = (text) => {
            if (!shouldShowStatus) return
            if (turnFinished || !text || text === lastStatusText) return
            pendingStatusText = text
            if (!statusEditInFlight && !statusCooldownTimer) {
                flushStatusEdit()
            }
        }

        child.on("cancel_by_user", () => {
            wasCancelled = true
        })

        const processLine = (line) => {
            const trimmed = line.trim()
            if (!trimmed) return
            try {
                const evt = JSON.parse(trimmed)
                if (evt.conversation_id && !detectedConvId) {
                    detectedConvId = evt.conversation_id
                }
                if (evt.event === "init" && evt.conversation_id) {
                    detectedConvId = evt.conversation_id
                    state.conversationId = detectedConvId
                    state.initializedConversations[detectedConvId] = true
                    saveStore()
                } else if (evt.event === "step_update" && evt.step_update) {
                    if (evt.step_update.conversation_id && !detectedConvId) {
                        detectedConvId = evt.step_update.conversation_id
                    }
                    if (evt.step_update.step_type === "tool" && evt.step_update.state === "ACTIVE") {
                        queueStatusEdit(formatToolStatus(evt.step_update))
                    } else if (evt.step_update.step_type === "agent_response" && typeof evt.step_update.text_delta === "string") {
                        streamedText += evt.step_update.text_delta
                    }
                } else if (evt.event === "result" && evt.result) {
                    if (evt.result.conversation_id) {
                        detectedConvId = evt.result.conversation_id
                    }
                    if (typeof evt.result.response === "string" && evt.result.response.trim()) {
                        finalResponse = evt.result.response
                    }
                }
            } catch {}
        }

        child.stdout.on("data", (chunk) => {
            stdoutBuf += chunk.toString("utf8")
            const lines = stdoutBuf.split("\n")
            stdoutBuf = lines.pop() || ""
            for (const line of lines) processLine(line)
        })

        child.stderr.on("data", (chunk) => {
            stderrBuf += chunk.toString("utf8")
            const matchLog = stderrBuf.match(/Full log:\s*(\S+)/)
            if (matchLog) logFileHint = matchLog[1]
        })

        child.on("close", async (code) => {
            runningProcesses.delete(user)
            if (stdoutBuf.trim()) processLine(stdoutBuf)

            turnFinished = true
            pendingStatusText = ""
            if (statusCooldownTimer) {
                clearTimeout(statusCooldownTimer)
                statusCooldownTimer = null
            }
            await editChain

            if (wasCancelled) {
                if (statusMsgId) {
                    await editAraRep(ctx, statusMsgId, `🛑 Proses perintah telah dihentikan.`)
                }
                resolve()
                return
            }

            if (detectedConvId) {
                state.conversationId = detectedConvId
                state.initializedConversations[detectedConvId] = true
                saveStore()
            }

            const outputText = (finalResponse || streamedText).trim()
            if (outputText) {
                const { cleaned, actions } = parseAraActions(outputText)
                await sendOrEditFinal(fmt(cleaned || "✅ Selesai."))
                if (actions.length) {
                    await runAraActions(ctx, actions)
                }
                resolve()
                return
            }

            if (code !== 0) {
                const cleanErr = stderrBuf
                    .split("\n")
                    .filter(l => l.trim() && !l.startsWith("warning:"))
                    .join("\n")
                    .trim()
                await sendOrEditFinal(
                    `❌ *Gagal menjalankan perintah (exit ${code})*\n${LINE}\n` +
                    `${cleanErr || "Tidak ada pesan error detail."}` +
                    (logFileHint ? `\nLog: ${logFileHint}` : "") +
                    `\n\nKetik *ara reset* jika sesi bermasalah, atau *ara akun* untuk mengecek status login.`
                )
                resolve()
                return
            }

            await sendOrEditFinal("✅ Perintah selesai dijalankan (tidak ada output teks tambahan).")
            resolve()
        })

        child.on("error", async (err) => {
            runningProcesses.delete(user)
            turnFinished = true
            if (statusCooldownTimer) {
                clearTimeout(statusCooldownTimer)
                statusCooldownTimer = null
            }
            await editChain
            await sendOrEditFinal(`❌ Gagal menjalankan binary agy: ${err.message}`)
            resolve()
        })
    })
}

/**
 * Handler saat Owner me-reply pesan bot tanpa mengetik prefix/command `ara`
 * @param {PluginCtx} ctx
 */
export async function handleAraReply(ctx) {
    if (!ctx.isOwner) return
    const { m, sock, jid } = ctx
    bindGameSocket(sock)

    // Jika sedang ada sesi game aktif di chat ini, cek apakah ini jawaban/hint/nyerah game
    if (getActiveSession(jid)) {
        const handled = await handleGameAnswer({ sock, m, jid })
        if (handled) return
        // Jika me-reply langsung ke pesan soal game (misal tebakan salah), jangan masuk ke Ara
        const activeSes = getActiveSession(jid)
        if (activeSes?.msgId && m.q?.key?.id === activeSes.msgId) {
            return
        }
    }

    // Jika me-reply pesan member lain di grup tanpa ketik `ara`, hanya lanjut jika me-reply pesan bot
    if (m.q && !m.q.key?.fromMe) {
        return
    }

    const rawReply = extractMsgText(m).trim()
    const hasMedia = Boolean(getMediaInfo(m) || getMediaInfo(m.q))
    if (!rawReply && !hasMedia) return

    // Jika sedang menunggu kode OAuth dari `ara login`, tangkap kodenya langsung
    if (pendingLogin && rawReply) {
        const statusMsgId = await sendAraRep(m, "oauth no jikkou: verifikasi kode...")
        const res = await submitOAuthCode(rawReply)
        await editAraRep(ctx, statusMsgId, res.message)
        return
    }

    const quotedRaw = extractMsgText(m.q)
    await executeAgyTurn(ctx, rawReply, quotedRaw)
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return

    const { m, sock, jid, q, text } = ctx
    const raw = (text || "").trim()
    const user = m.sender || m.key?.participant || jid
    const state = getUserState(user)
    const hasMedia = Boolean(getMediaInfo(m) || getMediaInfo(q))
    const quotedText = extractMsgText(q)

    const [first = "", ...rest] = raw.split(/\s+/)
    const sub = first.toLowerCase()
    const restText = rest.join(" ").trim()

    // ===== MENU / HELP =====
    if (!raw && !quotedText && !hasMedia) {
        return await sendAraRep(m, buildMenu(user))
    }
    if (sub === "menu" || sub === "help" || sub === "tools") {
        return await sendAraRep(m, buildMenu(user))
    }

    // ===== STOP / CANCEL =====
    if (sub === "stop" || sub === "cancel" || sub === "kill") {
        const proc = runningProcesses.get(user)
        if (!proc) {
            return await sendAraRep(m, "Tidak ada proses Ara yang sedang berjalan saat ini.")
        }
        proc.emit("cancel_by_user")
        try {
            proc.kill("SIGTERM")
            setTimeout(() => {
                try {
                    if (!proc.killed) proc.kill("SIGKILL")
                } catch {}
            }, 2000).unref()
        } catch {}
        runningProcesses.delete(user)
        return await sendAraRep(m, `🛑 Proses perintah yang sedang berjalan telah dihentikan.`)
    }

    // ===== RESET SESI (seperti `g reset`) =====
    if (sub === "reset" || sub === "new" || sub === "clear") {
        const had = Boolean(state.conversationId)
        state.conversationId = ""
        saveStore()
        return await sendAraRep(
            m,
            had
                ? `SESI DIHAPUS\n${LINE}\nPercakapan baru dimulai.`
                : `Tidak ada sesi aktif. Percakapan berikutnya akan membuat sesi baru.`
        )
    }

    // ===== EXPORT SESI (`ara -e [nama]`, seperti `g -e [nama]`) =====
    if (sub === "-e" || sub === "export") {
        if (!state.conversationId) {
            return await sendAraRep(m, "❌ Belum ada sesi aktif untuk di-export. Kirim perintah dulu: *ara <perintah>*")
        }
        const name = cleanName(rest.join("-")) || `ara-${Date.now()}`
        const summary = getConversationSummary(state.conversationId)
        const dbPath = path.join(CONVERSATIONS_DIR, `${state.conversationId}.db`)

        let dbGzipBase64 = ""
        try {
            if (fs.existsSync(dbPath)) {
                const stat = fs.statSync(dbPath)
                if (stat.size <= 15 * 1024 * 1024) {
                    const compressed = zlib.gzipSync(fs.readFileSync(dbPath))
                    dbGzipBase64 = compressed.toString("base64")
                }
            }
        } catch {}

        const payload = JSON.stringify({
            type: "ara-session",
            name,
            created: Date.now(),
            conversationId: state.conversationId,
            title: summary?.title || name,
            model: state.model,
            effort: state.effort,
            mode: state.mode,
            dbGzipBase64
        })

        const sent = await sock.sendMessage(jid, {
            document: Buffer.from(payload),
            mimetype: "application/json",
            fileName: `${name}.ara.json`
        }, { quoted: m })
        trackMsgId(sent?.key?.id)

        const infoMsg = await sock.sendMessage(jid, {
            text:
                `SESI DI-EXPORT\n${LINE}\n` +
                `• Nama  : ${name}\n` +
                `• Judul : ${summary?.title || "-"}\n` +
                `• ID    : ${state.conversationId}\n` +
                `Import: reply file di atas dengan "ara -r"`
        }, { quoted: sent })
        trackMsgId(infoMsg?.key?.id)
        return
    }

    // ===== IMPORT / RESUME SESI (`ara -r [id/nomor]`, seperti `g -r`) =====
    if (sub === "-r" || sub === "import" || sub === "resume") {
        // Jika me-reply file dokumen .ara.json / .agy.json
        if (q && (q.content === "documentMessage" || q.message?.documentMessage || q.message?.documentWithCaptionMessage)) {
            let obj, step = "download"
            try {
                let buf = await (q.download?.("buffer") ?? q.quoted?.download?.("buffer"))
                if (!buf) throw new Error("hasil download kosong")
                if (!Buffer.isBuffer(buf)) {
                    const chunks = []
                    for await (const c of buf) chunks.push(c)
                    buf = Buffer.concat(chunks)
                }
                step = "parse"
                obj = JSON.parse(buf.toString("utf8"))
            } catch (e) {
                return await sendAraRep(m, `❌ File tidak bisa dibaca (${step}): ${e.message}`)
            }

            if ((obj?.type !== "ara-session" && obj?.type !== "agy-session") || !obj?.conversationId) {
                return await sendAraRep(m, "❌ File export tidak valid.")
            }

            // Restore file .db percakapan jika belum ada di disk
            if (obj.dbGzipBase64) {
                const targetDb = path.join(CONVERSATIONS_DIR, `${obj.conversationId}.db`)
                if (!fs.existsSync(targetDb)) {
                    try {
                        fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true })
                        const rawDb = zlib.gunzipSync(Buffer.from(obj.dbGzipBase64, "base64"))
                        fs.writeFileSync(targetDb, rawDb, { mode: 0o600 })
                    } catch (e) {
                        console.error("[ara/agy] gagal restore db file:", e)
                    }
                }
            }

            state.conversationId = obj.conversationId
            if (obj.model) state.model = obj.model
            if (obj.effort) state.effort = obj.effort
            if (obj.mode) state.mode = obj.mode
            state.initializedConversations[obj.conversationId] = true
            saveStore()

            return await sendAraRep(
                m,
                `SESI DI-IMPORT\n${LINE}\n` +
                `• Nama  : ${obj.name || "-"}\n` +
                `• Judul : ${obj.title || "-"}\n` +
                `• ID    : ${obj.conversationId}\n` +
                `• Model : ${state.model}\n` +
                `Lanjutkan dengan: *ara <perintah>*`
            )
        }

        // Jika menggunakan nomor urut dari `ara sesi` atau UUID langsung
        if (restText) {
            const recent = getRecentConversations(15)
            let targetId = ""
            let targetTitle = "-"

            const idx = Number(restText)
            if (Number.isInteger(idx) && idx >= 1 && idx <= recent.length) {
                targetId = recent[idx - 1].conversation_id
                targetTitle = recent[idx - 1].title || "-"
            } else if (/^[0-9a-f-]{8,36}$/i.test(restText)) {
                const matched = recent.find(r => r.conversation_id.startsWith(restText.toLowerCase()))
                targetId = matched ? matched.conversation_id : restText
                targetTitle = matched?.title || "-"
            } else {
                return await sendAraRep(m, `❌ Masukkan nomor urut dari *ara sesi* atau reply file export dengan *ara -r*.`)
            }

            state.conversationId = targetId
            state.initializedConversations[targetId] = true
            saveStore()
            return await sendAraRep(
                m,
                `SESI DIAKTIFKAN\n${LINE}\n` +
                `• Judul : ${targetTitle}\n` +
                `• ID    : ${targetId}\n` +
                `Lanjutkan dengan: *ara <perintah>*`
            )
        }

        return await sendAraRep(m, "❌ Reply file export dengan perintah *ara -r*, atau ketik *ara -r <nomor_sesi>* dari daftar *ara sesi*.")
    }

    // ===== DAFTAR SESI (`ara sesi` / `ara list`) =====
    if (sub === "sesi" || sub === "list" || sub === "sessions" || sub === "history") {
        const rows = getRecentConversations(10)
        if (!rows.length) {
            return await sendAraRep(m, "Belum ada riwayat sesi percakapan Antigravity yang tersimpan.")
        }
        const lines = rows.map((r, i) => {
            const isCurrent = r.conversation_id === state.conversationId
            const badge = isCurrent ? " ✅ *[AKTIF]*" : ""
            const title = r.title || "(Tanpa Judul)"
            return `${i + 1}. *${title}*${badge}\n   ID: \`${r.conversation_id.slice(0, 8)}\` • ${r.step_count} steps`
        })
        return await sendAraRep(
            m,
            `DAFTAR SESI ANTIGRAVITY\n${LINE}\n` +
            `${lines.join("\n\n")}\n${LINE}\n` +
            `Ketik *ara -r <nomor>* untuk pindah ke sesi tersebut, atau *ara reset* untuk sesi baru.`
        )
    }

    // ===== CEK AKUN & STATUS (`ara akun` / `ara status` / `ara info`) =====
    if (sub === "akun" || sub === "account" || sub === "status" || sub === "info" || sub === "whoami") {
        const acc = getAccountInfo()
        const settings = getSettings()
        const summary = getConversationSummary(state.conversationId)

        let version = "-"
        let remoteStatus = "-"
        try {
            const { stdout } = await execFileAsync(AGY_BIN, ["--version"])
            version = stdout.trim()
        } catch {}
        try {
            const { stdout } = await execFileAsync(AGY_BIN, ["remote-control", "status"])
            const firstLine = stdout.trim().split("\n")[0] || "-"
            remoteStatus = firstLine.replace(/^Daemon status:\s*/i, "")
        } catch {}

        const workspaces = Array.isArray(settings.trustedWorkspaces) && settings.trustedWorkspaces.length
            ? settings.trustedWorkspaces.join(", ")
            : "-"

        return await sendAraRep(
            m,
            `STATUS AKUN & AGY CLI\n${LINE}\n` +
            `• Status Agent : ${getAgentStatus(user)}\n` +
            `• Status Login : ${acc.loggedIn ? "✅ Terhubung" : "❌ Belum Login"}\n` +
            `• Email Akun   : ${acc.email || "-"}\n` +
            `• Metode Auth  : ${acc.authMethod || "-"}\n` +
            `• Token Expiry : ${acc.expiry || "-"}${acc.isExpired && acc.hasRefreshToken ? " (Auto-Refresh Aktif)" : ""}\n` +
            `• Versi CLI    : agy v${version}\n` +
            `• Remote Daemon: ${remoteStatus}\n` +
            `• Workspaces   : ${workspaces}\n` +
            `• Sisa Kuota   : Ketik *ara kuota* untuk melihat rincian real-time\n` +
            `${LINE}\n` +
            `*KONFIGURASI SESI WA*\n` +
            `• Model Aktif  : ${state.model}\n` +
            `• Effort Level : ${state.effort}\n` +
            `• Mode Eksekusi: ${state.mode}\n` +
            `• Sesi Aktif   : ${state.conversationId ? `${state.conversationId}\n  (${summary?.title || "Tanpa Judul"})` : "Belum ada (Sesi Baru)"}`
        )
    }

    // ===== CEK KUOTA AGY (`ara kuota` / `ara kouta` / `ara quota` / `ara usage` / `ara limit`) =====
    if (sub === "kuota" || sub === "kouta" || sub === "quota" || sub === "usage" || sub === "limit") {
        const acc = getAccountInfo()
        if (!acc.loggedIn) {
            return await sendAraRep(m, "❌ Akun Antigravity belum login. Ketik *ara login* terlebih dahulu.")
        }

        const statusMsgId = await sendAraRep(m, "⏳ Mengambil informasi kuota Antigravity real-time...")
        const quotaList = await fetchAgyQuota()

        if (!quotaList || !quotaList.length) {
            return await editAraRep(ctx, statusMsgId, "❌ Gagal mengambil data kuota dari Antigravity CLI.")
        }

        const itemsText = quotaList.map((q) => {
            const bar = makeQuotaBar(q.remaining)
            const resetLabel = formatWibDate(q.resetTime)
            return (
                `• *${q.category}* — ${q.limitType}\n` +
                `  ${bar} *${q.remaining}*\n` +
                `  _Reset: ${resetLabel}_`
            )
        }).join("\n\n")

        const reply =
            `📊 *KUOTA ANTIGRAVITY (AGY)*\n${LINE}\n` +
            `• Akun  : ${acc.email || "-"}\n` +
            `• Model : ${state.model}\n\n` +
            `${itemsText}\n${LINE}\n` +
            `_Data diperbarui langsung dari cloud server Antigravity._`

        return await editAraRep(ctx, statusMsgId, reply)
    }

    // ===== LOGIN OAUTH (`ara login`) =====
    if (sub === "login" || sub === "auth") {
        const statusMsgId = await sendAraRep(m, "oauth no jikkou: meminta link login Google OAuth...")
        const res = await startOAuthLoginFlow(ctx)
        if (!res.ok) {
            return await editAraRep(ctx, statusMsgId, `❌ Gagal memulai login: ${res.error}`)
        }
        return await editAraRep(
            ctx,
            statusMsgId,
            `🔑 *LINK LOGIN ANTIGRAVITY*\n${LINE}\n` +
            `Klik link di bawah ini untuk login dengan akun Google:\n\n` +
            `${res.url}\n\n` +
            `${LINE}\n` +
            `*Cara Menyelesaikan Login (Batas 60 detik):*\n` +
            `1. Buka link di atas dan login ke akun Google kamu.\n` +
            `2. Salin *kode otorisasi* (atau URL callback) yang muncul.\n` +
            `3. *Reply* pesan ini langsung dengan kode/URL tersebut, atau ketik:\n` +
            `   *ara code <kode_otorisasi>*`
        )
    }

    // ===== SUBMIT KODE OAUTH (`ara code <kode>`) =====
    if (sub === "code" || sub === "kode" || sub === "verify") {
        const codeInput = restText || stripBotHeader(q?.text || "")
        if (!codeInput) {
            return await sendAraRep(m, "❌ Masukkan kode otorisasi. Contoh: *ara code 4/0A...*")
        }
        const statusMsgId = await sendAraRep(m, "oauth no jikkou: verifikasi kode...")
        const res = await submitOAuthCode(codeInput)
        await editAraRep(ctx, statusMsgId, res.message)
        return
    }

    // ===== LOGOUT (`ara logout`) =====
    if (sub === "logout") {
        cleanupPendingLogin()
        if (!fs.existsSync(OAUTH_TOKEN_FILE)) {
            return await sendAraRep(m, "Akun sudah dalam keadaan logout.")
        }
        const prev = getAccountInfo()
        try {
            fs.copyFileSync(OAUTH_TOKEN_FILE, `${OAUTH_TOKEN_FILE}.bak`)
            fs.rmSync(OAUTH_TOKEN_FILE, { force: true })
        } catch (e) {
            return await sendAraRep(m, `❌ Gagal logout: ${e.message}`)
        }
        return await sendAraRep(
            m,
            `✅ *LOGOUT BERHASIL*\n${LINE}\n` +
            `Akun *${prev.email || "-"}* telah diputuskan.\n` +
            `Ketik *ara login* jika ingin menghubungkan akun kembali.`
        )
    }

    // ===== MODEL MANAGEMENT (`ara model [nama/nomor]`) =====
    if (sub === "model" || sub === "models") {
        if (!restText) {
            const list = AVAILABLE_MODELS.map((mod, idx) => {
                const active = mod.id === state.model ? " ✅" : ""
                return `${idx + 1}. \`${mod.id}\`${active}\n   ${mod.label}`
            }).join("\n")
            return await sendAraRep(
                m,
                `DAFTAR MODEL ANTIGRAVITY\n${LINE}\n` +
                `Model aktif: *${state.model}*\n\n` +
                `${list}\n${LINE}\n` +
                `Ketik *ara model <nomor/nama>* untuk mengganti model.`
            )
        }

        const idx = Number(restText)
        let chosen = null
        if (Number.isInteger(idx) && idx >= 1 && idx <= AVAILABLE_MODELS.length) {
            chosen = AVAILABLE_MODELS[idx - 1]
        } else {
            const qLower = restText.toLowerCase()
            chosen = AVAILABLE_MODELS.find(
                mod => mod.id.toLowerCase() === qLower || mod.label.toLowerCase().includes(qLower)
            ) || { id: restText.trim(), label: restText.trim() }
        }

        state.model = chosen.id
        saveStore()
        return await sendAraRep(
            m,
            `✅ Model aktif diubah ke:\n*${chosen.label}* (\`${chosen.id}\`)`
        )
    }

    // ===== EFFORT MANAGEMENT (`ara effort [level]`) =====
    if (sub === "effort") {
        if (!restText) {
            return await sendAraRep(
                m,
                `EFFORT LEVEL\n${LINE}\n` +
                `Effort aktif: *${state.effort}*\n` +
                `Pilihan: ${VALID_EFFORTS.map(e => (e === state.effort ? `*${e}* ✅` : e)).join(" | ")}\n\n` +
                `Contoh: *ara effort high*`
            )
        }
        const lvl = restText.toLowerCase()
        if (!VALID_EFFORTS.includes(lvl)) {
            return await sendAraRep(m, `❌ Effort tidak valid. Pilihan: ${VALID_EFFORTS.join(", ")}`)
        }
        state.effort = lvl
        saveStore()
        return await sendAraRep(m, `✅ Reasoning effort diubah ke: *${lvl}*`)
    }

    // ===== MODE MANAGEMENT (`ara mode [auto|accept-edits|plan]`) =====
    if (sub === "mode") {
        if (!restText) {
            return await sendAraRep(
                m,
                `EXECUTION MODE\n${LINE}\n` +
                `Mode aktif: *${state.mode}*\n` +
                `Pilihan: ${VALID_MODES.map(e => (e === state.mode ? `*${e}* ✅` : e)).join(" | ")}\n\n` +
                `Contoh: *ara mode plan*`
            )
        }
        const mName = restText.toLowerCase()
        if (!VALID_MODES.includes(mName)) {
            return await sendAraRep(m, `❌ Mode tidak valid. Pilihan: ${VALID_MODES.join(", ")}`)
        }
        state.mode = mName
        saveStore()
        return await sendAraRep(m, `✅ Mode eksekusi diubah ke: *${mName}*`)
    }

    // ===== REMOTE-CONTROL MANAGEMENT (`ara remote [status|start|stop]`) =====
    if (sub === "remote" || sub === "remote-control") {
        const action = (rest[0] || "status").toLowerCase()
        if (!["status", "start", "stop"].includes(action)) {
            return await sendAraRep(m, "Gunakan: *ara remote status*, *ara remote start*, atau *ara remote stop*")
        }
        try {
            const { stdout, stderr } = await execFileAsync(AGY_BIN, ["remote-control", action], { timeout: 15000 })
            const out = (stdout || stderr || "✅ Selesai.").trim()
            return await sendAraRep(m, `REMOTE CONTROL (${action.toUpperCase()})\n${LINE}\n${out}`)
        } catch (e) {
            return await sendAraRep(m, `❌ Gagal menjalankan remote-control ${action}:\n${e.stderr || e.message}`)
        }
    }

    // ===== MCP MANAGEMENT (`ara mcp [list|add|remove|enable|disable]`) =====
    if (sub === "mcp") {
        const mcpArgs = rest.length ? ["mcp", ...rest] : ["mcp", "list"]
        try {
            const { stdout, stderr } = await execFileAsync(AGY_BIN, mcpArgs, { timeout: 15000 })
            return await sendAraRep(m, `AGY MCP\n${LINE}\n${(stdout || stderr || "✅ Selesai.").trim()}`)
        } catch (e) {
            return await sendAraRep(m, `❌ Error MCP:\n${(e.stderr || e.message).trim()}`)
        }
    }

    // ===== PLUGIN AGY MANAGEMENT (`ara plugin [list|install|uninstall|enable|disable]`) =====
    if (sub === "plugin" || sub === "plugins") {
        const pluginArgs = rest.length ? ["plugin", ...rest] : ["plugin", "list"]
        try {
            const { stdout, stderr } = await execFileAsync(AGY_BIN, pluginArgs, { timeout: 20000 })
            return await sendAraRep(m, `AGY PLUGINS\n${LINE}\n${(stdout || stderr || "✅ Selesai.").trim()}`)
        } catch (e) {
            return await sendAraRep(m, `❌ Error Plugin AGY:\n${(e.stderr || e.message).trim()}`)
        }
    }

    // ===== WORKSPACE MANAGEMENT (`ara workspace [list|add <dir>|del <dir>]`) =====
    if (sub === "workspace" || sub === "workspaces") {
        const settings = getSettings()
        const list = Array.isArray(settings.trustedWorkspaces) ? settings.trustedWorkspaces : []
        const action = (rest[0] || "list").toLowerCase()
        const targetDir = rest.slice(1).join(" ").trim()

        if (action === "add" && targetDir) {
            const resolved = path.resolve(targetDir)
            if (!list.includes(resolved)) list.push(resolved)
            settings.trustedWorkspaces = list
            saveSettings(settings)
            return await sendAraRep(m, `✅ Workspace ditambahkan: \`${resolved}\``)
        }
        if ((action === "del" || action === "rm" || action === "remove") && targetDir) {
            const resolved = path.resolve(targetDir)
            settings.trustedWorkspaces = list.filter(w => w !== resolved && w !== targetDir)
            saveSettings(settings)
            return await sendAraRep(m, `✅ Workspace dihapus: \`${targetDir}\``)
        }

        return await sendAraRep(
            m,
            `TRUSTED WORKSPACES\n${LINE}\n` +
            (list.length ? list.map((w, i) => `${i + 1}. \`${w}\``).join("\n") : "Belum ada workspace.") +
            `\n${LINE}\n` +
            `• ara workspace add <path>\n• ara workspace del <path>`
        )
    }

    // ===== EKSEKUSI PROMPT KE ANTIGRAVITY =====
    if (!raw && !quotedText && !hasMedia) {
        return await sendAraRep(m, buildMenu(user))
    }

    const defaultPrompt = hasMedia
        ? "Tolong baca/lihat dan analisis lampiran file atau gambar ini."
        : "Tolong analisis atau tanggapi pesan yang di-reply ini."
    await executeAgyTurn(ctx, raw || defaultPrompt, quotedText)
}

// Tetap export askAra sebagai kompatibilitas jika dipanggil dari tempat lain
async function askAra(ctx, userText) {
    const { m, jid } = ctx
    const sender = m.sender
    const data = araManager.get(jid, sender)
    if (!data || !data.active) return

    try {
        const firstTurn = !data.geminiSession
        const prompt = firstTurn
            ? `Mulai sekarang kamu berperan sebagai "${data.name}". ${data.persona}\n\nBalas dengan gaya itu secara konsisten di seluruh percakapan ini, singkat dan natural kayak chat beneran.\n\nPesan dari lawan bicara: ${userText}`
            : userText

        const { response, session } = await askGemini(prompt, data.geminiSession)
        araManager.set(jid, sender, { geminiSession: session })
        await sendAraRep(m, fmt(response))
    } catch (e) {
        await sendAraRep(m, `❌ ${data.name} lagi error: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "arashi-agy",
    commands: ["ara", "arashi", "agy", "ra", "ai"],
    categories: ["ai", "owner"],
    description: "Perintah & kontrol penuh Antigravity (Arashi) via WhatsApp beserta manajemen sesi dan akun"
}

plugin.config = {
    bypassPrefix: true
}

plugin.handleReply = handleAraReply
plugin.isAraMessage = isAraMessage

plugin.meta = {
    filename: "ara.js",
    version: "2.0.0",
    author: "Kado",
    note: "Integrasi Antigravity CLI (Arashi/Ara) dengan dukungan reply-trigger, sesi ala gemini.js, cek akun, dan OAuth login via WA",
    path: "ai"
}

export { askAra }
export default plugin
