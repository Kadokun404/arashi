import { config } from "#root/config.js"
import fs from "fs"
import path from "path"

const API_KEY = config.apikey.theresav
const BASE = "https://api.theresav.eu/api"

const TTL = 28 * 24 * 60 * 60 * 1000 // 4 minggu
const VIDEO_MAX_BYTES = 64 * 1024 * 1024 // 64 MB
const DIR = path.join(process.cwd(), "cache", "play")
const INDEX = path.join(DIR, "index.json")
fs.mkdirSync(DIR, { recursive: true })

// ---------- cache ----------
let index = {}
try {
    index = JSON.parse(fs.readFileSync(INDEX, "utf8"))
} catch {
    index = {}
}

const saveIndex = () => {
    try {
        fs.writeFileSync(INDEX, JSON.stringify(index))
    } catch {}
}

/**
 * Cache key for a query: lowercase with punctuation collapsed, so
 * "ocean & engines" and "ocean engines" hit the same stored link. Falls back
 * to the plain lowercase form when nothing ASCII-alphanumeric is left.
 * @param {string} raw
 */
const queryKey = (raw) => {
    const s = String(raw || "").toLowerCase().replace(/\s+/g, " ").trim()
    return s.replace(/[^a-z0-9]+/g, " ").trim() || s
}

/**
 * Extract 11-char YouTube video ID from URL or raw ID if valid.
 * @param {string} input
 */
function extractVideoId(input) {
    const str = String(input || "").trim()
    if (!str) return null
    const m = str.match(
        /(?:youtu\.be\/|(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/|live\/))([a-zA-Z0-9_-]{11})/i
    )
    return m ? m[1] : null
}

const audioFileOf = (id) => path.join(DIR, `${id}.mp3`)
const videoFileOf = (id) => path.join(DIR, `${id}.mp4`)

const freshAudio = (e) => Boolean(e?.id && Date.now() - (e.time || 0) < TTL && fs.existsSync(audioFileOf(e.id)))
const freshVideo = (e) => Boolean(e?.id && Date.now() - (e.vtime || e.time || 0) < TTL && fs.existsSync(videoFileOf(e.id)))

function cleanup() {
    const now = Date.now()
    for (const [k, e] of Object.entries(index)) {
        if (!e || typeof e !== "object") {
            delete index[k]
            continue
        }
        const hasAudio = now - (e.time || 0) < TTL && fs.existsSync(audioFileOf(e.id))
        const hasVideo = now - (e.vtime || e.time || 0) < TTL && fs.existsSync(videoFileOf(e.id))
        if (!hasAudio && !hasVideo) delete index[k]
    }
    const usedAudio = new Set(Object.values(index).map(e => `${e.id}.mp3`))
    const usedVideo = new Set(Object.values(index).map(e => `${e.id}.mp4`))
    for (const f of fs.readdirSync(DIR)) {
        if (f.endsWith(".mp3") && !usedAudio.has(f)) {
            try { fs.unlinkSync(path.join(DIR, f)) } catch {}
        } else if (f.endsWith(".mp4") && !usedVideo.has(f)) {
            try { fs.unlinkSync(path.join(DIR, f)) } catch {}
        }
    }
    saveIndex()
}
cleanup()
setInterval(cleanup, 6 * 60 * 60 * 1000).unref()

// ---------- helper ----------
async function api(endpoint, params) {
    const res = await fetch(`${BASE}${endpoint}?${new URLSearchParams(params)}`, {
        headers: { "x-apikey": API_KEY }
    })
    const text = await res.text()
    try {
        return JSON.parse(text)
    } catch {
        throw new Error(`API response invalid (${res.status})`)
    }
}

async function probeSize(url) {
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: { Range: "bytes=0-0" },
            signal: AbortSignal.timeout(15000)
        })
        if (!res.ok && res.status !== 206) return 0
        const cr = res.headers.get("content-range") || ""
        const cl = res.headers.get("content-length") || ""
        await res.body?.cancel().catch(() => undefined)
        return Number(cr.split("/")[1]) || Number(cl) || 0
    } catch {
        return 0
    }
}

function fmtSize(bytes) {
    const b = Number(bytes) || 0
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
    if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${b} B`
}

function toSeconds(dur) {
    if (typeof dur === "number") return dur
    const parts = String(dur || "").trim().split(/[.:]/).map(Number)
    if (parts.some(Number.isNaN)) return 0
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return parts[0] || 0
}

function formatDuration(sec) {
    const s = Number(sec) || 0
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function caption({ title, channel, duration_sec, url }) {
    return `${title}
━━━━━━━━━━━━━━━━
Channel : ${channel}
Durasi  : ${formatDuration(duration_sec)}
Link    : ${url}`
}

function findEntryById(videoId) {
    if (!videoId) return null
    return Object.values(index).find(e => e?.id === videoId) || null
}

async function searchYoutubeCandidates(query) {
    const search = await api("/search/youtube", { query })
    if (!search?.status || !Array.isArray(search?.data) || !search.data.length) {
        throw new Error(search?.message || `Lagu/video "${query}" gak ketemu.`)
    }
    return search.data
        .filter(item => item?.videoId || item?.url)
        .map(item => {
            const id = item.videoId || extractVideoId(item.url)
            return {
                id,
                url: item.url || `https://www.youtube.com/watch?v=${id}`,
                title: item.title || null,
                channel: item.channel || null,
                duration: item.duration || null,
                seconds: toSeconds(item.duration),
                thumbnail: item.thumbnail || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null)
            }
        })
}

async function run(ctx) {
    const { m, sock, jid, q, text, command } = ctx
    const cmd = String(command ?? "").toLowerCase()
    const isVideo = cmd === "ypv" || cmd === "ytv" || cmd === "ytvideo"
    const isDirectAudio = cmd === "yp" || cmd === "ytp"

    let query = (text || "").trim()
    if (!query && q) query = (q.text || "").trim()
    if (!query) {
        return await m.arashirep(
            isVideo
                ? "masukkan judul atau link youtube (contoh: *ypv lihat kebunku* atau *ypv https://youtu.be/...*)"
                : "mw denger lagu apa? (bisa judul atau link youtube)"
        )
    }

    await m.react("🔎")

    const directId = extractVideoId(query)
    const cacheKey = directId ? `id:${directId}` : queryKey(query)
    const cachedEntry = index[cacheKey] || (directId ? findEntryById(directId) : null)

    try {
        // ===== FAST CACHE HIT =====
        if (isVideo && freshVideo(cachedEntry)) {
            const vCap = [cachedEntry.title, cachedEntry.channel].filter(Boolean).join(" - ")
            await sock.sendMessage(jid, {
                video: fs.readFileSync(videoFileOf(cachedEntry.id)),
                mimetype: "video/mp4",
                caption: vCap || undefined
            }, { quoted: m })
            return await m.react("⚡")
        }

        if (!isVideo && freshAudio(cachedEntry)) {
            if (!isDirectAudio && cachedEntry.thumbnail) {
                await sock.sendMessage(jid, {
                    image: { url: cachedEntry.thumbnail },
                    caption: caption(cachedEntry)
                }, { quoted: m })
            }
            await sock.sendMessage(jid, {
                audio: fs.readFileSync(audioFileOf(cachedEntry.id)),
                mimetype: "audio/mp4",
                ptt: false,
                fileName: `${cachedEntry.title || cachedEntry.id}.mp3`
            }, { quoted: m })
            return await m.react("⚡")
        }

        // ===== BUILD CANDIDATES =====
        let candidates
        if (directId) {
            candidates = [{
                id: directId,
                url: `https://www.youtube.com/watch?v=${directId}`,
                title: cachedEntry?.title || null,
                channel: cachedEntry?.channel || null,
                duration: null,
                seconds: cachedEntry?.duration_sec || 0,
                thumbnail: cachedEntry?.thumbnail || `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`
            }]
        } else if (cachedEntry?.id) {
            candidates = [{
                id: cachedEntry.id,
                url: cachedEntry.url || `https://www.youtube.com/watch?v=${cachedEntry.id}`,
                title: cachedEntry.title || null,
                channel: cachedEntry.channel || null,
                duration: null,
                seconds: cachedEntry.duration_sec || 0,
                thumbnail: cachedEntry.thumbnail || `https://i.ytimg.com/vi/${cachedEntry.id}/hqdefault.jpg`
            }]
        } else {
            candidates = await searchYoutubeCandidates(query)
        }

        // Cek apakah salah satu kandidat sudah ada di cache disk lewat query lain
        for (const c of candidates) {
            if (!c.id) continue
            const byId = findEntryById(c.id)
            if (isVideo && freshVideo(byId)) {
                index[cacheKey] = { ...byId, vtime: Date.now() }
                saveIndex()
                const vCap = [byId.title || c.title, byId.channel || c.channel].filter(Boolean).join(" - ")
                await sock.sendMessage(jid, {
                    video: fs.readFileSync(videoFileOf(c.id)),
                    mimetype: "video/mp4",
                    caption: vCap || undefined
                }, { quoted: m })
                return await m.react("⚡")
            }
            if (!isVideo && freshAudio(byId)) {
                index[cacheKey] = { ...byId, time: Date.now() }
                saveIndex()
                if (!isDirectAudio && byId.thumbnail) {
                    await sock.sendMessage(jid, {
                        image: { url: byId.thumbnail },
                        caption: caption(byId)
                    }, { quoted: m })
                }
                await sock.sendMessage(jid, {
                    audio: fs.readFileSync(audioFileOf(c.id)),
                    mimetype: "audio/mp4",
                    ptt: false,
                    fileName: `${byId.title || c.title || c.id}.mp3`
                }, { quoted: m })
                return await m.react("⚡")
            }
        }

        let lastErr = null

        for (const c of candidates) {
            try {
                const targetUrl = c.url || `https://www.youtube.com/watch?v=${c.id}`

                if (isVideo) {
                    const dl = await api("/download/ytmp4", { url: targetUrl, quality: "720" })
                    if (!dl?.status || !dl?.download_url) {
                        throw new Error(dl?.message || `Gagal ambil video dari "${c.title || c.id}"`)
                    }

                    const total = Number(dl.filesize) || (await probeSize(dl.download_url))
                    if (total > VIDEO_MAX_BYTES) {
                        throw new Error(`Video terlalu besar (${fmtSize(total)}, maks ${fmtSize(VIDEO_MAX_BYTES)}).`)
                    }

                    const title = dl.title || c.title || c.id
                    const channel = dl.channel || c.channel || "-"
                    const duration_sec = Number(dl.duration_sec) || c.seconds || 0
                    const thumbnail = dl.thumbnail || c.thumbnail
                    const vCap = [title, channel].filter(Boolean).join(" - ")

                    const r = await fetch(dl.download_url, { signal: AbortSignal.timeout(120000) })
                    if (!r.ok) throw new Error(`HTTP ${r.status} saat mengunduh video`)
                    const buf = Buffer.from(await r.arrayBuffer())

                    if (buf.length > VIDEO_MAX_BYTES) {
                        throw new Error(`Video terlalu besar (${fmtSize(buf.length)}, maks ${fmtSize(VIDEO_MAX_BYTES)}).`)
                    }

                    if (c.id) {
                        try {
                            fs.writeFileSync(videoFileOf(c.id), buf)
                            const prev = findEntryById(c.id) || {}
                            index[cacheKey] = {
                                ...prev,
                                id: c.id,
                                url: targetUrl,
                                title,
                                channel,
                                duration_sec,
                                thumbnail,
                                time: prev.time || Date.now(),
                                vtime: Date.now()
                            }
                            saveIndex()
                        } catch {}
                    }

                    await sock.sendMessage(jid, {
                        video: buf,
                        mimetype: "video/mp4",
                        caption: vCap || undefined
                    }, { quoted: m })
                    return await m.react("✅")
                }

                // ===== AUDIO MODE (yp / play / ytp) =====
                const dl = await api("/download/ytmp3", { url: targetUrl, format: "mp3", bitrate: "64k" })
                if (!dl?.status || !dl?.download_url) {
                    throw new Error(dl?.message || `Gagal ambil audio dari "${c.title || c.id}"`)
                }

                const title = dl.title || c.title || c.id
                const channel = dl.channel || c.channel || "-"
                const duration_sec = Number(dl.duration_sec) || c.seconds || 0
                const thumbnail = dl.thumbnail || c.thumbnail

                let audioBuf = null
                try {
                    const r = await fetch(dl.download_url, { signal: AbortSignal.timeout(90000) })
                    if (!r.ok) throw new Error(`HTTP ${r.status}`)
                    audioBuf = Buffer.from(await r.arrayBuffer())
                    if (c.id) {
                        fs.writeFileSync(audioFileOf(c.id), audioBuf)
                        const prev = findEntryById(c.id) || {}
                        index[cacheKey] = {
                            ...prev,
                            id: c.id,
                            url: targetUrl,
                            title,
                            channel,
                            duration_sec,
                            thumbnail,
                            time: Date.now()
                        }
                        saveIndex()
                    }
                } catch {
                    audioBuf = null
                }

                if (!isDirectAudio && thumbnail) {
                    await sock.sendMessage(jid, {
                        image: { url: thumbnail },
                        caption: caption({ title, channel, duration_sec, url: targetUrl })
                    }, { quoted: m })
                }

                await sock.sendMessage(jid, {
                    audio: audioBuf || { url: dl.download_url },
                    mimetype: "audio/mp4",
                    ptt: false,
                    fileName: `${title}.mp3`
                }, { quoted: m })
                return await m.react("✅")
            } catch (e) {
                lastErr = e
            }
        }

        throw lastErr || new Error("Tidak ada kandidat yang berhasil diunduh.")
    } catch (e) {
        await m.react("❌")
        return await m.arashirep(`❌ Error: ${e.message}`)
    }
}

const plugin = {
    run,
    name: "youtube play",
    commands: ["ytp", "yp", "play", "ypv"],
    categories: ["downloader"],
    description: "play musik & video dari youtube (support judul atau link). yp = langsung musik, ypv = langsung video"
}

plugin.meta = {
    filename: "play.js",
    version: "9",
    author: "Kado",
    note: "support yp/play/ytp (audio) & ypv (video) dengan input judul maupun link YouTube + cache disk",
    path: "downloader"
}

export default plugin
