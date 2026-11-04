import fs from "fs"
import path from "path"
import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "../types/types.js"
 */

const API_KEY = config.apikey.theresav
const BASE = "https://api.theresav.eu/api"
const SPOTIFY_REGEX = /https?:\/\/open\.spotify\.com\/track\/\S+/i

const TTL = 28 * 24 * 60 * 60 * 1000 // 4 minggu
const DIR = path.join(process.cwd(), "cache", "spotify")
const INDEX = path.join(DIR, "index.json")
fs.mkdirSync(DIR, { recursive: true })

let index = {}
try { index = JSON.parse(fs.readFileSync(INDEX, "utf8")) } catch {}

const saveIndex = () => fs.writeFileSync(INDEX, JSON.stringify(index))
const norm = s => s.toLowerCase().replace(/\s+/g, " ").trim()
const fileOf = id => path.join(DIR, `${id}.mp3`)
const idOf = url => (url.match(/track\/([a-zA-Z0-9]+)/) || [])[1] || Buffer.from(url).toString("base64url").slice(0, 22)
const fresh = e => e && Date.now() - e.time < TTL && fs.existsSync(fileOf(e.id))

function cleanup() {
    const now = Date.now()
    for (const [k, e] of Object.entries(index)) {
        if (now - e.time >= TTL || !fs.existsSync(fileOf(e.id))) delete index[k]
    }
    const used = new Set(Object.values(index).map(e => e.id + ".mp3"))
    for (const f of fs.readdirSync(DIR)) {
        if (f.endsWith(".mp3") && !used.has(f)) fs.unlinkSync(path.join(DIR, f))
    }
    saveIndex()
}
cleanup()
setInterval(cleanup, 6 * 60 * 60 * 1000).unref()

async function api(endpoint, params) {
    const res = await fetch(`${BASE}${endpoint}?${new URLSearchParams(params)}`, {
        headers: { "x-apikey": API_KEY }
    })
    return res.json()
}

function caption({ title, artist, album, url }) {
    let text = `Spotify Play\n\nTitle: ${title || "Unknown"}\nArtist: ${artist || "Unknown"}\n`
    if (album) text += `Album: ${album}\n`
    text += `Link: ${url}`
    return text
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text, command } = ctx

    if (!text) {
        return await m.arashirep("Please provide a song title or Spotify URL.\n\nExample:\n.splay you love me not\n.splay https://open.spotify.com/track/xxx")
    }

    const isUrl = SPOTIFY_REGEX.test(text)
    const isDirect = String(command ?? "").toLowerCase() === "sp"

    await m.react("🔍")
    const key = norm(text)
    const cached = index[key]

    // ===== CACHE HIT =====
    if (fresh(cached)) {
        if (!isDirect) await m.arashirep(caption(cached))
        await sock.sendMessage(jid, {
            audio: fs.readFileSync(fileOf(cached.id)),
            mimetype: "audio/mpeg",
            ptt: false,
            fileName: `${cached.title}.mp3`
        }, { quoted: m })
        return await m.react("⚡")
    }

    // ===== CACHE MISS =====
    try {
        let trackUrl = text

        if (!isUrl) {
            const search = await api("/search/spotify", { query: text })
            const found = search?.result?.[0]
            if (!search?.status || !found?.spotifyUrl) {
                await m.react("❌")
                return await m.arashirep("Song not found.")
            }
            trackUrl = found.spotifyUrl
        }

        const id = idOf(trackUrl)

        // track yang sama sudah pernah di-cache lewat query/url lain
        const same = Object.values(index).find(e => e.id === id && fresh(e))
        let data

        if (same) {
            data = same
        } else {
            const dl = await api("/download/spotify", { url: trackUrl })
            if (!dl?.status || !dl?.result?.downloadUrl) {
                await m.react("❌")
                return await m.arashirep("Song not found.")
            }

            const track = dl.result
            data = {
                id,
                title: track.title,
                artist: Array.isArray(track.artists) ? track.artists.join(", ") : track.artists,
                album: track.album?.name,
                url: track.spotify_url || trackUrl
            }

            try {
                const r = await fetch(track.downloadUrl)
                if (!r.ok) throw new Error(r.status)
                fs.writeFileSync(fileOf(id), Buffer.from(await r.arrayBuffer()))
            } catch {
                // gagal simpan, kirim langsung tanpa cache
                if (!isDirect) await m.arashirep(caption(data))
                await sock.sendMessage(jid, {
                    audio: { url: track.downloadUrl },
                    mimetype: "audio/mpeg",
                    ptt: false,
                    fileName: `${data.title}.mp3`
                }, { quoted: m })
                return await m.react("✅")
            }
        }

        index[key] = { ...data, time: Date.now() }
        saveIndex()

        if (!isDirect) await m.arashirep(caption(data))
        await sock.sendMessage(jid, {
            audio: fs.readFileSync(fileOf(id)),
            mimetype: "audio/mpeg",
            ptt: false,
            fileName: `${data.title}.mp3`
        }, { quoted: m })
        await m.react("✅")

    } catch (error) {
        await m.react("❌")
        return await m.arashirep("An error occurred while fetching the song. Please try again later.")
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "spotify",
    commands: ["splay", "sp"],
    categories: ["main"],
    description: "Play music from Spotify via query or URL, dengan cache 4 minggu. sp = langsung kirim audio tanpa detail lagu"
}

plugin.meta = {
    filename: "spotify.js",
    version: "5",
    author: config.devName,
    note: "cache file mp3 di cache/spotify, ttl 28 hari, query/url sama langsung kirim dari disk",
    path: "main"
}

export default plugin