import { allPaths } from "#root/src/all-paths.js"
import { tempFileLock } from "#root/src/async-lock.js"
import { getContentType, downloadMediaMessage } from "baileys"
import path from "node:path"
import Stream from "node:stream"
import fs from "node:fs"
import { config } from "#root/config.js"

const LUNE_UPLOAD = "https://direct.lunee.lol/upload"
const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

const URL_KEYS = [
    "url", "directUrl", "direct_url", "link",
    "downloadUrl", "download_url", "fileUrl", "file_url"
]

/**
 * cari url di response json, apapun bentuknya
 * @param {any} obj
 * @param {number} depth
 * @returns {string|null}
 */
function findUrl(obj, depth = 0) {
    if (!obj || depth > 4) return null
    if (typeof obj === "string") return /^https?:\/\//i.test(obj) ? obj : null
    if (Array.isArray(obj)) {
        for (const it of obj) {
            const r = findUrl(it, depth + 1)
            if (r) return r
        }
        return null
    }
    if (typeof obj === "object") {
        for (const k of URL_KEYS) {
            if (typeof obj[k] === "string" && /^https?:\/\//i.test(obj[k])) return obj[k]
        }
        for (const v of Object.values(obj)) {
            const r = findUrl(v, depth + 1)
            if (r) return r
        }
    }
    return null
}

/** @param {number} bytes */
function fmtSize(bytes) {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${bytes} B`
}

/**
 * @param {string} filePath
 * @param {{ forcedFilename?: string, mimetype?: string }} opts
 */
const luneUploader = async (filePath, { forcedFilename, mimetype }) => {
    const name = forcedFilename || path.basename(filePath)
    const buffer = await fs.promises.readFile(filePath)

    const form = new FormData()
    form.append(
        "file",
        new Blob([buffer], { type: mimetype || "application/octet-stream" }),
        name
    )

    const res = await fetch(LUNE_UPLOAD, {
        method: "POST",
        headers: { "User-Agent": UA },
        body: form,
        signal: AbortSignal.timeout(120000)
    })

    const raw = await res.text()
    if (!res.ok) {
        throw new Error(`upload gagal (${res.status}): ${raw.slice(0, 200)}`)
    }

    let data = null
    try { data = JSON.parse(raw) } catch { /* bukan json */ }

    const url = findUrl(data) || raw.match(/https?:\/\/[^\s"'<>]+/)?.[0]
    if (!url) {
        throw new Error(`url tidak ada di response: ${raw.slice(0, 200)}`)
    }

    const expiresAt =
        data?.expiresAt || data?.expires_at ||
        data?.data?.expiresAt || data?.data?.expires_at || null

    return { url, size: fmtSize(buffer.length), expiresAt }
}

/**
 * @import {PluginCtx, } from "../../types/types.js"
 */

/**
 *
 * @param {PluginCtx} ctx
 * @returns {Promise <void>}
 */
async function run(ctx) {
    const { m, q, sock, jid } = ctx

    // DEFINE YOUR TEMP PATH FIRST HERE
    const TEMP_PATH = allPaths.temp

    // boilerplate
    const wam = q || m
    let wam2 = {}
    let isFileCached = false

    const safeWriteStream = async (filePath, inputStream) => {
        const dirname = path.dirname(filePath)
        await fs.promises.mkdir(dirname, { recursive: true })
        try {
            const writeStream = fs.createWriteStream(filePath, { flags: "wx" })
            await Stream.promises.pipeline(inputStream, writeStream)
            return
        } catch (err) {
            if (err.code === "EEXIST") {
                isFileCached = true
                return
            }
            throw err
        }
    }

    // if content in interactive button
    const isInteractiveMessageHasMedia = wam.message?.interactiveMessage?.header?.hasMediaAttachment
    if (isInteractiveMessageHasMedia) {
        const ct = getContentType(wam.message.interactiveMessage.header)
        wam2.message = wam.message.interactiveMessage.header
        wam2.content = ct
    } else {
        wam2 = wam
        wam2.content = wam.content
    }

    // find media key
    const mediaKey = wam2.message?.[wam2.content]?.mediaKey
    if (!mediaKey) return await wam.arashirep("cant find media key")

    // find mime
    let mimetype = wam2.message[wam2.content]?.mimetype
    if (!mimetype && wam2.content === "extendedTextMessage") {
        mimetype = "image/jpeg"
    }
    if (!mimetype) return await wam.arashirep("cant find mimetype")

    // generate filename and extension
    const fileExt = mimetype.split("/")?.[1]
    if (!fileExt) return await wam.arashirep("cant resolve file extension")

    const fileName = Buffer.from(mediaKey).toString("base64url")
    const filenameWithExtension = `${fileName}.${fileExt}`
    const filePath = path.join(TEMP_PATH, filenameWithExtension)

    // filename for url
    const fnu = wam?.message?.documentMessage?.fileName

    let result
    try {
        // save to disk by stream
        // use lock biar gak tabrakan
        await tempFileLock.withLock(fileName, async () => {
            const mediaStream = await downloadMediaMessage(wam2, "stream")
            await safeWriteStream(filePath, mediaStream)
        })

        // begin upload
        result = await luneUploader(filePath, {
            forcedFilename: fnu || filenameWithExtension,
            mimetype
        })
    } catch (err) {
        return await wam.arashirep(`gagal upload\n\n${err?.message || "error"}`)
    }

    // button send
    return await sock.relayMessage(
        jid,
        {
            interactiveMessage: {
                header: {
                    title: "file uploaded" + (isFileCached ? "(cached)" : "")
                },
                body: {
                    text:
                        (result.expiresAt ? `expire : ${result.expiresAt}\n` : "") +
                        `size : ${result.size}\n` +
                        `mime : ${mimetype}`
                },
                footer: { text: "by lunee.lol" },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "cta_copy",
                            buttonParamsJson: JSON.stringify({
                                display_text: "salin url nya",
                                copy_code: result.url
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "liat gambar nya",
                                url: result.url
                            })
                        }
                    ]
                },
                contextInfo: {
                    stanzaId: wam.key.id,
                    participant: wam.key.participant || wam.key.remoteJid,
                    quotedMessage: wam.message
                }
            }
        },
        {
            additionalNodes: [
                {
                    tag: "biz",
                    attrs: {},
                    content: [
                        {
                            tag: "interactive",
                            attrs: {
                                type: "native_flow",
                                v: "1"
                            },
                            content: [
                                {
                                    tag: "native_flow",
                                    attrs: {
                                        v: "9",
                                        name: "mixed"
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    )
}

const plugin = { run }

plugin.name = "lunee uploader"
plugin.commands = ["uplune", "lune"]
plugin.categories = ["tools"]
plugin.description = "unggah file apapun ke lunee dan dapatkan url untuk mengunduhnya. powered by https://lunee.lol"

plugin.meta = {
    filename: "upload-lune.js",
    author: config.devName,
    note: "versi uploader lunee dari tourl.js",
    version: "1",
    url: "https://lunee.lol",
    path: "tools"
}

plugin.config = {
    removeFirstUrl: true
}

export default plugin