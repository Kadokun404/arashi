/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import https from "node:https"
import fs from "node:fs"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import { Readable, Transform } from "node:stream"
import { allPaths } from "#root/src/all-paths.js"

const agent = new https.Agent({ rejectUnauthorized: false })


const EXT_MIME = {
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
    mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav", opus: "audio/ogg",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif"
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function getBrowserHeaders() {
    return {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
    }
}

/**
 * nama file dari content-disposition, kalau gak ada dari url
 * @param {Response} response
 * @param {string} finalUrl
 */
function getFileName(response, finalUrl) {
    const cd = response.headers.get("content-disposition") || ""
    const raw = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i)?.[1] ||
        cd.match(/filename="?([^";]+)"?/i)?.[1]

    let name = ""
    if (raw) {
        try { name = decodeURIComponent(raw.trim().replace(/^"|"$/g, "")) } catch { name = raw }
    }
    if (!name) {
        try {
            name = decodeURIComponent(new URL(finalUrl).pathname.split("/").pop() || "")
        } catch { /* ignore */ }
    }
    return name
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text } = ctx

    const rawText = String(text || "")
    const useJsonFlag = /(?:^|\s)-json(?=\s|$)/i.test(rawText)
    const useDownload = /(?:^|\s)-d(?=\s|$)/i.test(rawText)

    const input = rawText
        .replace(/(?:^|\s)-(?:json|d)(?=\s|$)/gi, " ")
        .trim()

    if (!input || !/^https?:\/\//i.test(input)) {
        return await m.arashirep(
            "Please provide a valid url\n" +
            "Example: get https://api.azbry.com/api/ai/zai?prompt=test\n" +
            "Media: f https://pixeldrain.com/api/file/xxxx -d"
        )
    }

    const originalUrl = input
    const startTime = Date.now()
    let tempFile = null

    try {
        const response = await fetch(originalUrl, {
            method: "GET",
            headers: getBrowserHeaders(),
            redirect: "follow",
            agent
        })

        const finalUrl = response.url
        const redirected = finalUrl !== originalUrl

        if (!response.ok) {
            return await m.arashirep(`Request failed with status ${response.status}`)
        }

        let mime = response.headers.get("content-type")?.split(";")[0].trim() || "application/octet-stream"
        let fileName = getFileName(response, finalUrl)

        // server kadang kasih octet-stream, tebak dari ekstensi nama file
        if (mime === "application/octet-stream") {
            const guessed = EXT_MIME[path.extname(fileName).slice(1).toLowerCase()]
            if (guessed) mime = guessed
        }

        const ext = mime.split("/")[1] || "bin"
        if (!fileName || !path.extname(fileName)) fileName = `result.${ext}`

        const length = Number(response.headers.get("content-length") || 0)

        const isTextLike =
            mime.includes("json") ||
            mime.startsWith("text/") ||
            mime.includes("javascript")

        if (useJsonFlag && !isTextLike) {
            await response.body?.cancel()
            return await m.arashirep("Cannot use -json flag on binary content")
        }

        // teks / json: balas langsung kecuali minta -d
        if (isTextLike && !useDownload) {
            const buffer = Buffer.from(await response.arrayBuffer())
            return await m.arashirep(buffer.toString("utf-8"))
        }

        // media / file tanpa -d: tampilkan info saja, gak didownload
        if (!useDownload) {
            await response.body?.cancel()
            return await m.arashirep(
                `URL: ${originalUrl}\n` +
                `Final: ${finalUrl}\n` +
                `Redirected: ${redirected}\n\n` +
                `Type: ${mime}\n` +
                `Name: ${fileName}\n` +
                `Size: ${length ? formatBytes(length) : "unknown"}\n\n` +
                `Tambah -d buat download dan kirim filenya`
            )
        }

        // ── -d: download ke file temp (stream), kirim, lalu hapus ──
        if (length) {
            await response.body?.cancel()
            return await m.arashirep(
                `File kegedean (${formatBytes(length)})`
            )
        }

        await m.react("⏳")

        await fs.promises.mkdir(allPaths.temp, { recursive: true })
        tempFile = path.join(
            allPaths.temp,
            `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`
        )

        let received = 0
        const limiter = new Transform({
            transform(chunk, _enc, cb) {
                received += chunk.length
                if (received) {
                    return cb(new Error(`y`))
                }
                cb(null, chunk)
            }
        })

        await pipeline(
            Readable.fromWeb(response.body),
            limiter,
            fs.createWriteStream(tempFile)
        )

        const totalTime = Date.now() - startTime
        const speed = formatBytes(received / (totalTime / 1000)) + "/s"

        const caption =
            `URL: ${originalUrl}\n` +
            `Final: ${finalUrl}\n` +
            `Redirected: ${redirected}\n\n` +
            `Type: ${mime}\n` +
            `Size: ${formatBytes(received)}\n\n` +
            `Time: ${totalTime}ms\n` +
            `Speed: ${speed}`

        const src = { url: tempFile }

        if (mime.startsWith("image/")) {
            await sock.sendMessage(jid, { image: src, caption }, { quoted: m.raw })
        } else if (mime.startsWith("video/")) {
            await sock.sendMessage(jid, { video: src, mimetype: mime, caption }, { quoted: m.raw })
        } else if (mime.startsWith("audio/")) {
            await sock.sendMessage(jid, { audio: src, mimetype: mime }, { quoted: m.raw })
        } else {
            await sock.sendMessage(
                jid,
                { document: src, fileName, mimetype: mime, caption },
                { quoted: m.raw }
            )
        }

        return await m.react("✅")
    } catch (e) {
        return await m.arashirep(`Fetch error: ${e.message}`)
    } finally {
        if (tempFile) await fs.promises.rm(tempFile, { force: true }).catch(() => {})
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "get",
    commands: ["get", "fetch", "f"],
    categories: ["tools"],
    description: "fetch a response from a url, pakai -d buat download media/file"
}

plugin.meta = {
    filename: "get.js",
    version: "3",
    author: "Kado",
    note: "-d download lewat stream ke temp lalu dihapus, -json khusus teks",
    path: "tools"
}

export default plugin