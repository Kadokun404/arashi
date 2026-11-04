import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import webp from "node-webpmux"
import sharp from "sharp"

export function buildStickerExif(metadata) {
    const json = Buffer.from(JSON.stringify(metadata), "utf-8")
    const exif = Buffer.concat([
        Buffer.from([
            0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
            0x07, 0x00,
        ]),
        Buffer.alloc(4),
        Buffer.from([0x16, 0x00, 0x00, 0x00]),
        json,
    ])
    exif.writeUInt32LE(json.length, 14)
    return exif
}

export async function addExif(webpBuf, pack = "", author = "") {
    const img = new webp.Image()
    await img.load(webpBuf)
    img.exif = buildStickerExif({
        "sticker-pack-id": crypto.randomBytes(16).toString("hex"),
        "sticker-pack-name": pack,
        "sticker-pack-publisher": author,
        "emojis": ["🤍"]
    })
    return await img.save(null)
}

export async function imageToWebp(buffer, { isFull = false, quality = 75 } = {}) {
    let img = sharp(buffer)
    if (isFull) {
        img = img.resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
    } else {
        img = img.resize(512, 512, {
            fit: "cover"
        })
    }
    return await img.webp({ quality }).toBuffer()
}

export async function videoToWebp(buffer, { isFull = false, maxDuration = 5 } = {}) {
    const tmpIn = path.join(os.tmpdir(), `v2w_in_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`)
    const tmpOut = path.join(os.tmpdir(), `v2w_out_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`)

    await fs.writeFile(tmpIn, buffer)

    const convert = async (fps = 15, q = 55, size = 512) => {
        const filter = isFull
            ? `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=${fps}`
            : `crop=min(iw\\,ih):min(iw\\,ih),scale=${size}:${size},fps=${fps}`

        const args = [
            "-y",
            "-i", tmpIn,
            "-t", String(maxDuration), // Maksimal 5 detik
            "-vf", filter,
            "-vcodec", "libwebp",
            "-lossless", "0",
            "-compression_level", "4",
            "-q:v", String(q),
            "-loop", "0",
            "-an",
            tmpOut
        ]

        await new Promise((resolve, reject) => {
            const p = spawn("ffmpeg", args)
            let stderr = "";
            p.stderr.on("data", d => stderr += d.toString())
            p.on("close", code => code === 0 ? resolve() : reject(new Error(stderr || `FFmpeg exit ${code}`)))
        })

        return await fs.readFile(tmpOut)
    }

    try {
        let out = await convert(15, 55, 512)
        // Pastikan ukuran file di bawah 950KB (batas aman WhatsApp adalah 1MB)
        if (out.length > 950 * 1024) {
            out = await convert(12, 40, 384)
        }
        return out
    } finally {
        await fs.unlink(tmpIn).catch(() => {})
        await fs.unlink(tmpOut).catch(() => {})
    }
}

export async function createSticker(buffer, { isVideo = false, isFull = false, pack = "", author = "" } = {}) {
    let webpBuffer
    if (isVideo) {
        webpBuffer = await videoToWebp(buffer, { isFull, maxDuration: 5 })
    } else {
        const isWebp = buffer.slice(0, 4).toString() === "RIFF" && buffer.slice(8, 12).toString() === "WEBP"
        if (isWebp) {
            webpBuffer = buffer
        } else {
            webpBuffer = await imageToWebp(buffer, { isFull })
        }
    }
    return await addExif(webpBuffer, pack, author)
}
