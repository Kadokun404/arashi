import crypto from "node:crypto"
import https from "node:https"
import JSZip from "jszip"
import sharp from "sharp"

export function sha256(buffer) {
    return crypto.createHash("sha256").update(buffer).digest()
}

export function toB64Url(buffer) {
    return Buffer.from(buffer)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "")
}

export function isWebP(buffer) {
    return (
        buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
    )
}

export function isAnimatedWebP(buffer) {
    if (!isWebP(buffer)) return false

    let offset = 12
    while (offset < buffer.length - 8) {
        const chunk = buffer.toString("ascii", offset, offset + 4)
        const size = buffer.readUInt32LE(offset + 4)

        if (chunk === "VP8X" && buffer[offset + 8] & 0x02) return true
        if (chunk === "ANIM" || chunk === "ANMF") return true

        offset += 8 + size + (size % 2)
    }

    return false
}

export function classifySticker(buffer, stickerMessage = {}) {
    if (stickerMessage?.isLottie) {
        return { ext: "json", mimetype: "application/json", isAnimated: true, isLottie: true }
    }
    return { ext: "webp", mimetype: "image/webp", isAnimated: isAnimatedWebP(buffer), isLottie: false }
}

export async function makeTrayWebp(buffer) {
    return await sharp(buffer, { animated: false })
        .resize(252, 252, { fit: "cover" })
        .webp()
        .toBuffer()
}

export async function makeBlankTrayWebp() {
    return await sharp({
        create: {
            width: 252,
            height: 252,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .webp()
        .toBuffer()
}

export async function makeThumbnailJpeg(buffer) {
    return await sharp(buffer)
        .resize(252, 252, { fit: "cover" })
        .jpeg()
        .toBuffer()
}

export async function uploadToServer(sock, buffer, { hkdf, mediaPath, mediaKey = crypto.randomBytes(32) }) {
    const expanded = Buffer.from(
        crypto.hkdfSync("sha256", mediaKey, Buffer.alloc(32), Buffer.from(hkdf), 112)
    )

    const iv = expanded.subarray(0, 16)
    const cipherKey = expanded.subarray(16, 48)
    const macKey = expanded.subarray(48, 80)

    const cipher = crypto.createCipheriv("aes-256-cbc", cipherKey, iv)
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])

    const mac = crypto
        .createHmac("sha256", macKey)
        .update(iv)
        .update(encrypted)
        .digest()
        .subarray(0, 10)

    const encBuffer = Buffer.concat([encrypted, mac])
    const fileSha256 = sha256(buffer)
    const fileEncSha256 = sha256(encBuffer)

    let hosts = []
    let auth = null

    try {
        if (typeof sock.refreshMediaConn === "function") {
            const mediaConn = await sock.refreshMediaConn(false)
            if (mediaConn?.auth && Array.isArray(mediaConn?.hosts)) {
                auth = mediaConn.auth
                hosts = mediaConn.hosts.map((h) => (typeof h === "string" ? h : h.hostname)).filter(Boolean)
            }
        }
    } catch (_) {}

    if (!auth || !hosts.length) {
        const iq = await sock.query({
            tag: "iq",
            attrs: {
                id: sock.generateMessageTag?.() ?? Date.now().toString(),
                to: "s.whatsapp.net",
                type: "set",
                xmlns: "w:m"
            },
            content: [{ tag: "media_conn", attrs: {} }]
        })

        const mediaConn = iq.content?.find((v) => v.tag === "media_conn")
        if (!mediaConn) throw new Error("media_conn tidak ditemukan dari WhatsApp")

        auth = mediaConn.attrs?.auth
        if (!auth) throw new Error("auth media_conn tidak ditemukan")

        hosts = (mediaConn.content || [])
            .filter((v) => v.tag === "host")
            .map((v) => v.attrs?.hostname)
            .filter(Boolean)
    }

    if (!hosts.length) throw new Error("Host upload WhatsApp tidak ditemukan")

    const token = encodeURIComponent(
        fileEncSha256.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
    )

    let lastError = null

    for (const host of hosts) {
        try {
            const json = await new Promise((resolve, reject) => {
                const url = new URL(
                    `https://${host}${mediaPath}/${token}?auth=${encodeURIComponent(auth)}&token=${token}`
                )

                const req = https.request(
                    {
                        hostname: url.hostname,
                        port: 443,
                        path: url.pathname + url.search,
                        method: "POST",
                        headers: {
                            Origin: "https://web.whatsapp.com",
                            Referer: "https://web.whatsapp.com/",
                            "Content-Type": "application/octet-stream",
                            "Content-Length": encBuffer.length
                        }
                    },
                    (res) => {
                        let body = ""
                        res.on("data", (c) => (body += c))
                        res.on("end", () => {
                            if (res.statusCode < 200 || res.statusCode >= 300) {
                                return reject(new Error(`Upload gagal ${res.statusCode}: ${body}`))
                            }
                            try {
                                resolve(JSON.parse(body))
                            } catch {
                                reject(new Error(`Response bukan JSON: ${body}`))
                            }
                        })
                    }
                )

                req.on("error", reject)
                req.write(encBuffer)
                req.end()
            })

            const directPath = json.direct_path ?? json.directPath ?? json.url ?? json.path
            if (!directPath) throw new Error("directPath tidak ditemukan dalam respon upload")

            return {
                mediaKey,
                fileLength: buffer.length,
                fileSha256,
                fileEncSha256,
                directPath,
                ...json
            }
        } catch (e) {
            lastError = e
        }
    }

    throw lastError ?? new Error("Semua host upload gagal dihubungi")
}

export async function sendCustomStickerPack(sock, jid, pack, meta = {}, quoted = null) {
    const zip = new JSZip()
    const stickersMetadata = []
    const hydrated = pack.map((item) => ({ ...item, buffer: Buffer.from(item.buffer) }))

    for (const item of hydrated) {
        const fileName = `${toB64Url(sha256(item.buffer))}.${item.ext}`
        zip.file(fileName, item.buffer)

        stickersMetadata.push({
            fileName,
            isAnimated: Boolean(item.isAnimated),
            emojis: item.emojis || [""],
            accessibilityLabel: item.accessibilityLabel || "",
            isLottie: Boolean(item.isLottie),
            mimetype: item.mimetype || "image/webp"
        })
    }

    const trayIconFileName = "tray_icon.webp"
    const traySource = hydrated.find((v) => !v.isLottie)?.buffer

    const trayBuffer = traySource ? await makeTrayWebp(traySource) : await makeBlankTrayWebp()
    zip.file(trayIconFileName, trayBuffer)

    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" })

    const packUpload = await uploadToServer(sock, archive, {
        hkdf: "WhatsApp Sticker Pack Keys",
        mediaPath: "/mms/sticker-pack"
    })

    const thumbnailBuffer = await makeThumbnailJpeg(trayBuffer)

    const thumbUpload = await uploadToServer(sock, thumbnailBuffer, {
        hkdf: "WhatsApp Sticker Pack Thumbnail Keys",
        mediaPath: "/mms/thumbnail-sticker-pack",
        mediaKey: packUpload.mediaKey
    })

    const packId = meta.id || `Pack_${crypto.randomBytes(8).toString("hex")}`
    const packName = meta.name || "Arashi Pack"
    const packPublisher = meta.publisher || "Arashi"
    const packDescription = meta.description || `Sticker pack dibuat menggunakan ${packPublisher}`

    return await sock.relayMessage(
        jid,
        {
            messageContextInfo: {
                messageSecret: crypto.randomBytes(32)
            },
            stickerPackMessage: {
                stickerPackId: packId,
                name: packName,
                publisher: packPublisher,
                packDescription: packDescription,
                stickers: stickersMetadata,
                fileLength: packUpload.fileLength,
                fileSha256: packUpload.fileSha256,
                fileEncSha256: packUpload.fileEncSha256,
                mediaKey: packUpload.mediaKey,
                directPath: packUpload.directPath,
                mediaKeyTimestamp: Math.floor(Date.now() / 1000),
                stickerPackSize: packUpload.fileLength,
                stickerPackOrigin: 2,
                trayIconFileName,
                thumbnailDirectPath: thumbUpload.directPath,
                thumbnailSha256: thumbUpload.fileSha256,
                thumbnailEncSha256: thumbUpload.fileEncSha256,
                thumbnailHeight: 252,
                thumbnailWidth: 252,
                imageDataHash: thumbUpload.fileSha256.toString("base64")
            }
        },
        quoted ? { quoted } : {}
    )
}

export default {
    sha256,
    toB64Url,
    isWebP,
    isAnimatedWebP,
    classifySticker,
    makeTrayWebp,
    makeBlankTrayWebp,
    makeThumbnailJpeg,
    uploadToServer,
    sendCustomStickerPack
}
