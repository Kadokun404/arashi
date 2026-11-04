/**
 * GetDL All-In-One Downloader & Search Scraper
 * Creator: IzzXd
 * Base: https://www.getdl.space
 * Saluran: https://whatsapp.com/channel/0029VbDyL6d9RZAh3JjEM325
 * Note: pliss guys jangan di klaim 100% buatan lu, lu boleh kok modifikasi trs share lagi tapi tolong jangan ilangin header creator sama ch-nya
 */

import fs from "node:fs"
import crypto from "node:crypto"
import axios from "axios"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)

const _p = ["fJMupwGtP5IrlSHzB608x3nEdfsErTvFeMd081GnP5Ap", "w3XyVqs9w32RI6cD+GrEeJYnpgT4PsEolCOiAao8xw=="]
const _k = [0x4d, 0xa1, 0x17, 0xc3, 0x62, 0x9e, 0x0b, 0xf4]

function _ld() {
    const raw = Buffer.from(_p.join(""), "base64")
    const out = Buffer.alloc(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = raw[i] ^ _k[i % _k.length]
    return out.toString("utf8")
}

function _hd() {
    try {
        const src = fs.readFileSync(__filename, "utf8")
        const m = src.match(/^\s*\/\*\*[\s\S]*?\*\//)
        if (!m) return ""
        const keys = ["Creator:", "Saluran:", "Note:"]
        const lines = m[0].split("\n").map(l => l.replace(/^\s*\*?\s*/, "").replace(/\s+/g, ""))
        const pick = keys.map(k => lines.find(l => l.startsWith(k)))
        if (pick.some(x => !x)) return ""
        return crypto.createHash("sha256").update(pick.join("")).digest("hex")
    } catch (_) {
        return ""
    }
}

function _ck() {
    const h = _hd()
    if (!h || h !== _ld()) throw new Error("ctx invalid")
}

const CREATOR = "IzzXd"
const SALURAN = "https://whatsapp.com/channel/0029VbDyL6d9RZAh3JjEM325"
const BASE_URL = "https://www.getdl.space"
const YT_FALLBACK_API = "https://ytmediasave.com/api"
const SHIELD_KEY = "getdl-shield-2026"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

let proxyPool = []
let proxyIndex = 0

async function fetchProxies() {
    if (proxyPool.length) return proxyPool
    const pool = []
    try {
        const res = await axios.get("https://api.ikyyxd.my.id/v2l/proxy-free/ikyy-xsample", { timeout: 8000 })
        const list = Array.isArray(res.data) ? res.data : String(res.data || "").split("\n")
        list.forEach((p) => {
            const parts = String(p).trim().split(":")
            if (parts.length >= 4) pool.push(`http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`)
        })
    } catch (_) {}
    if (pool.length < 5) {
        try {
            const res = await axios.get("https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text&protocol=socks5&timeout=5000", { timeout: 8000 })
            String(res.data || "").split("\n").forEach((l) => {
                const c = l.trim()
                if (c.startsWith("socks5://")) pool.push(c)
            })
        } catch (_) {}
    }
    proxyPool = pool
    return proxyPool
}

function nextProxyAgent() {
    if (!proxyPool.length) return null
    const url = proxyPool[proxyIndex++ % proxyPool.length]
    try {
        if (url.startsWith("socks5://")) {
            const { SocksProxyAgent } = require("socks-proxy-agent")
            return new SocksProxyAgent(url)
        }
        const { HttpsProxyAgent } = require("https-proxy-agent")
        return new HttpsProxyAgent(url)
    } catch (_) {
        return null
    }
}

function generateToken(ts = Date.now()) {
    _ck()
    const slot = Math.floor(ts / 300000)
    return Buffer.from(`${ts}:${SHIELD_KEY}:${slot}`).toString("base64")
}

function detectPlatform(url) {
    _ck()
    const u = String(url || "").trim().toLowerCase()
    if (!u) return null
    if (u.includes("tiktok.com") || u.includes("vt.tiktok.com") || u.includes("vm.tiktok.com")) return "tiktok"
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube"
    if (u.includes("instagram.com") || u.includes("instagr.am")) return "instagram"
    if (u.includes("facebook.com") || u.includes("fb.watch") || u.includes("fb.com")) return "facebook"
    if (u.includes("terabox") || u.includes("1024tera") || u.includes("nephobox") || u.includes("mirrobox") || u.includes("momerybox") || u.includes("4funbox")) return "terabox"
    if (u.includes("pixiv.net") || u.includes("pixiv.me")) return "pixiv"
    if (u.includes("spotify.com") || u.includes("spotify.link")) return "spotify"
    if (u.includes("music.apple.com") || u.includes("itunes.apple.com") || u.includes("apple.co")) return "applemusic"
    if (u.includes("drive.google.com") || u.includes("docs.google.com")) return "gdrive"
    if (u.includes("shopee.") || u.includes("shp.ee")) return "shopee"
    if (u.includes("lemon8-app.com") || u.includes("lemon8.com")) return "lemon8"
    if (u.includes("douyin.com") || u.includes("iesdouyin.com")) return "douyin"
    if (u.includes("reddit.com") || u.includes("redd.it")) return "reddit"
    if (u.includes("pinterest.com") || u.includes("pin.it") || u.includes("pinterest.co")) return "pinterest"
    if (u.includes("soundcloud.com") || u.includes("on.soundcloud.com")) return "soundcloud"
    return "auto"
}

function buildDirectMediaUrl(rawUrl, platform, filename = "") {
    if (!rawUrl) return ""
    if (rawUrl.startsWith("/")) return `${BASE_URL}${rawUrl}`
    const lower = rawUrl.toLowerCase()
    const needsProxy = lower.includes("pximg.net") || lower.includes("douyinvod.com") || lower.includes("amemv.com") || platform === "pixiv" || platform === "douyin"
    if (needsProxy) {
        const fnParam = filename ? `&filename=${encodeURIComponent(filename)}` : ""
        return `${BASE_URL}/api/media?url=${encodeURIComponent(rawUrl)}${fnParam}&download=1`
    }
    return rawUrl
}

async function apiRequest(endpoint, options = {}) {
    _ck()
    const isFullUrl = /^https?:\/\//i.test(endpoint)
    const url = isFullUrl ? endpoint : `${BASE_URL}${endpoint}`
    const headers = {
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Referer": `${BASE_URL}/`,
        "Origin": BASE_URL,
        "X-Getdl-Token": generateToken(),
        "X-Getdl-Client": "web-app",
        "X-Requested-With": "XMLHttpRequest",
        ...(options.headers || {})
    }

    try {
        const res = await axios({
            url,
            method: options.method || "GET",
            headers,
            data: options.data,
            timeout: options.timeout || 25000
        })
        return res.data
    } catch (err) {
        const status = err.response && err.response.status
        if (status === 429 || status === 403) {
            await fetchProxies()
            for (let i = 0; i < 3; i++) {
                const agent = nextProxyAgent()
                if (!agent) break
                try {
                    const retryRes = await axios({
                        url,
                        method: options.method || "GET",
                        headers: { ...headers, "X-Getdl-Token": generateToken() },
                        data: options.data,
                        httpsAgent: agent,
                        httpAgent: agent,
                        timeout: 20000
                    })
                    return retryRes.data
                } catch (_) {}
            }
        }
        throw err
    }
}

async function fallbackYoutube(targetUrl) {
    _ck()
    const ytHeaders = {
        "User-Agent": UA,
        "Content-Type": "application/json",
        "Origin": "https://ytmediasave.com",
        "Referer": "https://ytmediasave.com/id/youtube-video-downloader/"
    }
    const infoRes = await axios.post(`${YT_FALLBACK_API}/fetch-info`, { url: targetUrl }, { headers: ytHeaders, timeout: 25000 })
    const info = infoRes.data
    if (!info || !info.videoId) throw new Error("Gagal mengambil informasi video YouTube.")

    const videoId = info.videoId
    const cleanTitle = String(info.title || "youtube_video").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 70)
    const rawDownloads = Array.isArray(info.downloads) ? info.downloads : []
    const formats = []

    for (let i = 0; i < rawDownloads.length; i++) {
        const item = rawDownloads[i]
        const height = item.height || 720
        const qualityKey = item.quality ? item.quality.split(" ")[0] : `${height}p`
        const ext = item.ext || (item.type === "audio" ? "mp3" : "mp4")
        let directUrl = ""

        if (height === 720 || height === 360 || item.type === "audio") {
            try {
                const prep = await axios.post(`${YT_FALLBACK_API}/prepare-download`, {
                    videoId,
                    quality: qualityKey,
                    ext,
                    bytes: item.approxBytes || 0,
                    size: item.size || "",
                    title: cleanTitle
                }, { headers: ytHeaders, timeout: 12000 })

                if (prep.data && prep.data.downloadUrl) {
                    const rawDl = prep.data.downloadUrl
                    const parsedObj = new URL(rawDl.startsWith("http") ? rawDl : `https://ytmediasave.com${rawDl}`)
                    directUrl = parsedObj.searchParams.get("url") || parsedObj.toString()
                }
            } catch (_) {}
        }

        formats.push({
            id: `yt-${videoId}-${qualityKey}-${i}`,
            type: item.type === "audio" ? "audio" : "video",
            qualityLabel: item.quality || `${height}p`,
            qualityKey,
            extension: ext,
            size: item.size || null,
            bytes: item.approxBytes || null,
            isHd: height >= 720,
            downloadUrl: directUrl || `https://ytmediasave.com/api/resolve-url?v=${videoId}&quality=${encodeURIComponent(qualityKey)}&ext=${ext}`
        })
    }

    const bestFormat = formats.find(f => f.downloadUrl && f.downloadUrl.includes("savenow.to")) || formats[0] || {}
    return {
        platform: "youtube",
        engine: "ytmediasave-fallback",
        id: videoId,
        title: info.title || "YouTube Video",
        author: info.author || info.channel || "YouTube Creator",
        duration: info.duration || 0,
        thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url: targetUrl,
        directUrl: bestFormat.downloadUrl || "",
        formats
    }
}

async function download(targetUrl) {
    _ck()
    const startTime = Date.now()
    try {
        if (!targetUrl || typeof targetUrl !== "string") {
            throw new Error("Parameter URL wajib diisi.")
        }
        const trimmedUrl = targetUrl.trim()
        const detected = detectPlatform(trimmedUrl)

        try {
            const data = await apiRequest(`/api/download?url=${encodeURIComponent(trimmedUrl)}`)
            if (data && data.success && data.result) {
                const res = data.result
                const platform = data.platform || detected || "unknown"
                const formats = (res.formats || []).map((f, idx) => {
                    const ext = f.extension || (f.type === "audio" ? "mp3" : f.type === "image" ? "jpg" : "mp4")
                    const fname = `getdl_${platform}_${idx + 1}.${ext}`
                    const direct = buildDirectMediaUrl(f.downloadUrl, platform, fname)
                    return {
                        id: f.id || `${platform}-${idx}`,
                        type: f.type || "video",
                        qualityLabel: f.qualityLabel || "Default",
                        extension: ext,
                        size: f.fileSizeFormatted || null,
                        bytes: f.bytes || null,
                        isHd: Boolean(f.isHd),
                        downloadUrl: direct,
                        rawUrl: f.downloadUrl || null
                    }
                })

                const primaryDirect = (formats[0] && formats[0].downloadUrl) || buildDirectMediaUrl(res.previewStreamUrl, platform)
                return formatResult(startTime, {
                    platform,
                    engine: data.engine || "getdl-api",
                    result: {
                        id: res.id || `${platform}-${Date.now()}`,
                        title: res.title || `${platform.toUpperCase()} Media`,
                        author: res.author || null,
                        authorHandle: res.authorHandle || null,
                        duration: res.duration || res.durationSeconds || null,
                        durationFormatted: res.durationFormatted || null,
                        thumbnail: res.thumbnailUrl || null,
                        url: trimmedUrl,
                        directUrl: primaryDirect,
                        formats
                    }
                })
            }
        } catch (apiErr) {
            if (detected !== "youtube") {
                const errData = apiErr.response && apiErr.response.data
                throw new Error((errData && errData.message) || apiErr.message)
            }
        }

        if (detected === "youtube") {
            const ytData = await fallbackYoutube(trimmedUrl)
            return formatResult(startTime, {
                platform: ytData.platform,
                engine: ytData.engine,
                result: ytData
            })
        }

        throw new Error("Gagal mengekstrak media dari URL tersebut.")
    } catch (err) {
        return formatError(startTime, err)
    }
}

async function search(platform, query, limit = 10) {
    _ck()
    const startTime = Date.now()
    try {
        const p = String(platform || "").trim().toLowerCase()
        const q = String(query || "").trim()
        const validPlatforms = ["tiktok", "youtube", "spotify", "soundcloud"]

        if (!validPlatforms.includes(p)) {
            throw new Error(`Platform search tidak valid (${p}). Gunakan: tiktok, youtube, spotify, atau soundcloud.`)
        }
        if (!q) {
            throw new Error("Kata kunci pencarian (query) tidak boleh kosong.")
        }

        const limParam = (p === "spotify" || p === "soundcloud") ? `&limit=${Number(limit) || 10}` : ""
        const data = await apiRequest(`/api/search/${p}?q=${encodeURIComponent(q)}${limParam}`)

        const rawList = (data && data.data && Array.isArray(data.data.tracks))
            ? data.data.tracks
            : (data && Array.isArray(data.results))
                ? data.results
                : []

        if (!rawList.length) {
            throw new Error((data && data.message) || `Tidak ditemukan hasil pencarian ${p} untuk "${q}".`)
        }

        const results = rawList.slice(0, Number(limit) || 10).map((item) => ({
            id: item.id || null,
            title: item.title || null,
            author: item.artist || item.channel || item.author || null,
            album: item.album || null,
            duration: item.duration || item.durationFormatted || null,
            views: item.views || item.playCount || null,
            published: item.published || null,
            thumbnail: item.thumbnail || item.thumbnailUrl || item.cover || null,
            url: item.url || item.spotifyUrl || item.soundcloudUrl || (p === "youtube" && item.id ? `https://www.youtube.com/watch?v=${item.id}` : null),
            previewUrl: item.previewUrl || item.playUrl || null
        }))

        return formatResult(startTime, {
            platform: p,
            query: q,
            total: results.length,
            results
        })
    } catch (err) {
        return formatError(startTime, err)
    }
}

function formatResult(startTime, data) {
    return {
        Creator: CREATOR,
        Saluran: SALURAN,
        time: `${Date.now() - startTime}ms`,
        status: true,
        ...data
    }
}

function formatError(startTime, err) {
    const msg = (err && err.message) ? err.message : String(err)
    return {
        Creator: CREATOR,
        Saluran: SALURAN,
        time: `${Date.now() - startTime}ms`,
        status: false,
        error: msg
    }
}

export {
    download,
    download as dl,
    search,
    detectPlatform,
    generateToken
}

export default {
    download,
    dl: download,
    search,
    detectPlatform,
    generateToken
}
