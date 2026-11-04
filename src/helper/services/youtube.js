/**
 * Copyright Kadokun
 * Helper / Scrape: YouTube Play & Downloader (Audio MP3 & Video MP4)
 * Support input berupa Judul Lagu/Video maupun Link YouTube langsung.
 *
 * Cara penggunaan:
 *   const youtubePlay = (await import('#helper/services/youtube.js')).default
 *
 *   // 1. Ambil Audio MP3 (bisa judul atau link YouTube)
 *   const audio = await youtubePlay('lihat kebunku jeje', { type: 'audio', buffer: true })
 *
 *   // 2. Ambil Video MP4 (bisa judul atau link YouTube)
 *   const video = await youtubePlay('https://youtu.be/dl01mdnCx2w', { type: 'video', quality: '720', buffer: true })
 */

import { config } from "#root/config.js"

const DEFAULT_API_KEY = config?.apikey?.theresav || "arashi"
const BASE_URL = "https://api.theresav.eu/api"
const VIDEO_MAX_BYTES = 64 * 1024 * 1024 // 64 MB

export const queryKey = (raw) => {
    const s = String(raw || "").toLowerCase().replace(/\s+/g, " ").trim()
    return s.replace(/[^a-z0-9]+/g, " ").trim() || s
}

export function extractVideoId(input) {
    const str = String(input || "").trim()
    if (!str) return null
    const m = str.match(
        /(?:youtu\.be\/|(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/|live\/))([a-zA-Z0-9_-]{11})/i
    )
    return m ? m[1] : null
}

export function toSeconds(dur) {
    if (typeof dur === "number") return dur
    const parts = String(dur || "").trim().split(/[.:]/).map(Number)
    if (parts.some(Number.isNaN)) return 0
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return parts[0] || 0
}

export function fmtSize(bytes) {
    const b = Number(bytes) || 0
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
    if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${b} B`
}

async function callApi(endpoint, params, apiKey = DEFAULT_API_KEY) {
    const res = await fetch(`${BASE_URL}${endpoint}?${new URLSearchParams(params)}`, {
        headers: { "x-apikey": apiKey },
        signal: AbortSignal.timeout(45000)
    })
    const text = await res.text()
    try {
        return JSON.parse(text)
    } catch {
        throw new Error(`Invalid JSON response from API (HTTP ${res.status})`)
    }
}

export async function probeSize(url) {
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

export async function searchYoutube(query, apiKey = DEFAULT_API_KEY) {
    const search = await callApi("/search/youtube", { query }, apiKey)
    if (!search?.status || !Array.isArray(search?.data) || !search.data.length) {
        throw new Error(search?.message || `Hasil pencarian "${query}" tidak ditemukan`)
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

export async function resolveAudio(candidateOrUrl, { bitrate = "64k", buffer = false, apiKey = DEFAULT_API_KEY } = {}) {
    const c = typeof candidateOrUrl === "string"
        ? { id: extractVideoId(candidateOrUrl), url: candidateOrUrl }
        : candidateOrUrl
    const targetUrl = c.url || `https://www.youtube.com/watch?v=${c.id}`
    const dl = await callApi("/download/ytmp3", { url: targetUrl, format: "mp3", bitrate }, apiKey)
    if (!dl?.status || !dl?.download_url) {
        throw new Error(dl?.message || `Gagal mengambil audio dari "${c.title || c.id || targetUrl}"`)
    }

    const result = {
        id: c.id || extractVideoId(targetUrl),
        url: targetUrl,
        title: dl.title || c.title || "YouTube Audio",
        channel: dl.channel || c.channel || "-",
        duration_sec: Number(dl.duration_sec) || c.seconds || 0,
        thumbnail: dl.thumbnail || c.thumbnail || null,
        mimetype: dl.mimetype || "audio/mpeg",
        filesize: Number(dl.filesize) || 0,
        download_url: dl.download_url
    }

    if (buffer) {
        const r = await fetch(result.download_url, { signal: AbortSignal.timeout(90000) })
        if (!r.ok) throw new Error(`Gagal mengunduh buffer audio (HTTP ${r.status})`)
        result.buffer = Buffer.from(await r.arrayBuffer())
        result.filesize = result.buffer.length
    }

    return result
}

export async function resolvePlayVideo(candidateOrUrl, { quality = "720", buffer = false, maxBytes = VIDEO_MAX_BYTES, apiKey = DEFAULT_API_KEY } = {}) {
    const c = typeof candidateOrUrl === "string"
        ? { id: extractVideoId(candidateOrUrl), url: candidateOrUrl }
        : candidateOrUrl
    const targetUrl = c.url || `https://www.youtube.com/watch?v=${c.id}`
    const dl = await callApi("/download/ytmp4", { url: targetUrl, quality }, apiKey)
    if (!dl?.status || !dl?.download_url) {
        throw new Error(dl?.message || `Gagal mengambil video dari "${c.title || c.id || targetUrl}"`)
    }

    const size = Number(dl.filesize) || (await probeSize(dl.download_url))
    if (maxBytes && size > maxBytes) {
        throw new Error(`Video terlalu besar (${fmtSize(size)}, maks ${fmtSize(maxBytes)})`)
    }

    const result = {
        id: c.id || extractVideoId(targetUrl),
        url: targetUrl,
        title: dl.title || c.title || "YouTube Video",
        channel: dl.channel || c.channel || "-",
        duration_sec: Number(dl.duration_sec) || c.seconds || 0,
        resolution: dl.resolution || quality,
        ext: dl.ext || "mp4",
        mimetype: "video/mp4",
        thumbnail: dl.thumbnail || c.thumbnail || null,
        filesize: size,
        download_url: dl.download_url
    }

    if (buffer) {
        const r = await fetch(result.download_url, { signal: AbortSignal.timeout(120000) })
        if (!r.ok) throw new Error(`Gagal mengunduh buffer video (HTTP ${r.status})`)
        result.buffer = Buffer.from(await r.arrayBuffer())
        result.filesize = result.buffer.length
        if (maxBytes && result.filesize > maxBytes) {
            throw new Error(`Video terlalu besar (${fmtSize(result.filesize)}, maks ${fmtSize(maxBytes)})`)
        }
    }

    return result
}

export default async function youtubePlay(query, options = {}) {
    const {
        type = "audio",
        quality = "720",
        bitrate = "64k",
        buffer = false,
        maxBytes = VIDEO_MAX_BYTES,
        apiKey = DEFAULT_API_KEY
    } = options

    const q = String(query || "").trim()
    if (!q) throw new Error("Masukkan judul lagu/video atau URL YouTube")

    const directId = extractVideoId(q)
    const candidates = directId
        ? [{
            id: directId,
            url: `https://www.youtube.com/watch?v=${directId}`,
            title: null,
            channel: null,
            duration: null,
            seconds: 0,
            thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`
        }]
        : await searchYoutube(q, apiKey)

    let lastErr = null
    for (const c of candidates) {
        try {
            if (type === "video" || type === "mp4" || type === "ypv") {
                return await resolvePlayVideo(c, { quality, buffer, maxBytes, apiKey })
            }
            return await resolveAudio(c, { bitrate, buffer, apiKey })
        } catch (e) {
            lastErr = e
        }
    }

    throw lastErr || new Error("Tidak ada kandidat YouTube yang berhasil diunduh")
}
