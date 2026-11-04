/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { generateWAMessageFromContent, prepareWAMessageMedia } from "baileys"
import { download, detectPlatform } from "#helper/aio.js"

const sanitizeFileName = (name) => String(name || "").replace(/[\\/:*?"<>|\n\r]/g, "").trim() || "media"

const fmtDuration = (sec) => {
    if (!sec) return "-"
    const s = Math.floor(Number(sec) || 0)
    if (s <= 0) return "-"
    const m = Math.floor(s / 60)
    const rem = s % 60
    return `${m.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`
}

/**
 * Kirim album gambar atau fallback berurutan jika relay album gagal
 */
async function sendAlbum(ctx, images, cap) {
    const { sock, m, jid } = ctx
    try {
        const medias = await Promise.all(
            images.slice(0, 10).map((img) =>
                prepareWAMessageMedia(
                    { image: { url: img.downloadUrl || img.rawUrl || img.url } },
                    { upload: sock.waUploadToServer }
                )
            )
        )

        const albumMessage = generateWAMessageFromContent(
            jid,
            {
                messageContextInfo: {
                    messageSecret: Buffer.from(Array(32).fill(0).map(() => Math.floor(Math.random() * 256)))
                },
                albumMessage: { expectedImageCount: medias.length, expectedVideoCount: 0 }
            },
            { quoted: m }
        )

        await sock.relayMessage(jid, albumMessage.message, { messageId: albumMessage.key.id })

        for (let i = 0; i < medias.length; i++) {
            const imgMsg = generateWAMessageFromContent(
                jid,
                {
                    imageMessage: { ...medias[i].imageMessage, caption: i === 0 ? cap : undefined }
                },
                { quoted: m }
            )

            imgMsg.message.messageContextInfo = {
                messageAssociation: { associationType: 1, parentMessageKey: albumMessage.key }
            }

            await sock.relayMessage(jid, imgMsg.message, { messageId: imgMsg.key.id })
            await new Promise((r) => setTimeout(r, 600))
        }
    } catch {
        // Fallback: kirim gambar berurutan
        for (let i = 0; i < Math.min(images.length, 5); i++) {
            await sock.sendMessage(
                jid,
                {
                    image: { url: images[i].downloadUrl || images[i].rawUrl || images[i].url },
                    caption: i === 0 ? cap : undefined
                },
                { quoted: m }
            )
            await new Promise((r) => setTimeout(r, 600))
        }
    }
}

/**
 * Pilih format video terbaik yang tidak melebihi batas WhatsApp (~70MB)
 */
function pickBestVideo(formats, fallbackUrl) {
    const videos = (formats || []).filter((f) => f.type === "video")
    if (!videos.length) return fallbackUrl ? { downloadUrl: fallbackUrl } : null

    const underLimit = videos.filter((f) => f.bytes && f.bytes > 0 && f.bytes <= 70 * 1024 * 1024)
    if (underLimit.length) {
        // Cari resolusi terbaik yang masih di bawah limit (e.g. 720p > 480p > 360p)
        return (
            underLimit.find((f) => /720p/i.test(f.qualityLabel || "")) ||
            underLimit.find((f) => /480p/i.test(f.qualityLabel || "")) ||
            underLimit[0]
        )
    }

    // Jika tidak ada info bytes, pilih 720p / 480p / 360p atau video pertama
    return (
        videos.find((f) => /720p/i.test(f.qualityLabel || "")) ||
        videos.find((f) => /480p/i.test(f.qualityLabel || "")) ||
        videos.find((f) => /360p/i.test(f.qualityLabel || "")) ||
        videos[0]
    )
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text, q } = ctx

    // Cari URL dari text atau reply (q.text)
    const rawInput = (text || q?.text || "").trim()
    const urlMatch = rawInput.match(/https?:\/\/[^\s]+/i)

    if (!urlMatch) {
        return await m.arashirep(
            `╭───「 *AIO DOWNLOADER* 」\n` +
            `│ Unduh media dari berbagai platform sosial media dengan mudah!\n` +
            `│\n` +
            `│ 📌 *Cara Penggunaan:*\n` +
            `│ • \`.aio <link>\`\n` +
            `│ • Reply pesan yang berisi link lalu ketik \`.aio\`\n` +
            `│\n` +
            `│ 🌐 *Platform yang Didukung:*\n` +
            `│ • TikTok & Douyin\n` +
            `│ • YouTube (Video / Shorts)\n` +
            `│ • Instagram (Reels / Post)\n` +
            `│ • Facebook (Watch / Video)\n` +
            `│ • Spotify & Apple Music\n` +
            `│ • SoundCloud\n` +
            `│ • Pinterest & Pixiv\n` +
            `│ • TeraBox & Google Drive\n` +
            `│ • Shopee Video & Lemon8\n` +
            `│ • Reddit\n` +
            `╰──────────────────\n` +
            `_Creator Engine: IzzXd (GetDL)_`
        )
    }

    let targetUrl = urlMatch[0].replace(/[),.;]+$/, "")
    await m.react("⏳")

    try {
        const res = await download(targetUrl)

        if (!res || !res.status || !res.result) {
            await m.react("❌")
            return await m.arashirep(`❌ Gagal mengambil media: ${res?.error || "Konten tidak ditemukan atau format tidak didukung."}`)
        }

        const data = res.result
        const platform = (res.platform || detectPlatform(targetUrl) || "AIO").toUpperCase()
        const title = data.title || `${platform} Media`
        const author = data.author || data.authorHandle || "-"
        const duration = data.durationFormatted || fmtDuration(data.duration)
        const formats = data.formats || []

        const caption =
            `╭───「 *${platform} DOWNLOAD* 」\n` +
            `│ 📝 *Judul:* ${title.length > 120 ? title.slice(0, 120) + "..." : title}\n` +
            `│ 👤 *Author:* ${author}\n` +
            (duration !== "-" ? `│ ⏱️ *Durasi:* ${duration}\n` : "") +
            `╰──────────────────\n` +
            `_Source: GetDL by IzzXd_`

        // Cek media images
        const images = formats.filter((f) => f.type === "image")
        const isAudioOnly = ["spotify", "soundcloud", "applemusic"].includes((res.platform || "").toLowerCase()) ||
            (!images.length && formats.length > 0 && formats.every((f) => f.type === "audio"))

        if (isAudioOnly) {
            const audioFormat = formats.find((f) => f.type === "audio")
            const audioUrl = audioFormat?.downloadUrl || data.directUrl

            if (!audioUrl) throw new Error("URL audio tidak ditemukan.")

            if (data.thumbnail) {
                await sock.sendMessage(jid, {
                    image: { url: data.thumbnail },
                    caption
                }, { quoted: m })
            }

            await sock.sendMessage(jid, {
                audio: { url: audioUrl },
                mimetype: "audio/mp4",
                ptt: false,
                fileName: `${sanitizeFileName(title)}.mp3`
            }, { quoted: m })

            await m.react("✅")
            return
        }

        if (images.length > 0 && !formats.some((f) => f.type === "video")) {
            // Konten gambar / slide foto
            if (images.length > 1) {
                await sendAlbum(ctx, images, caption)
            } else {
                await sock.sendMessage(jid, {
                    image: { url: images[0].downloadUrl || images[0].rawUrl || data.directUrl },
                    caption
                }, { quoted: m })
            }
            await m.react("✅")
            return
        }

        // Konten Video
        const chosenVideo = pickBestVideo(formats, data.directUrl)
        const videoUrl = chosenVideo?.downloadUrl || data.directUrl

        if (!videoUrl) throw new Error("URL video tidak ditemukan.")

        await sock.sendMessage(jid, {
            video: { url: videoUrl },
            caption
        }, { quoted: m })

        await m.react("✅")
    } catch (err) {
        await m.react("❌")
        return await m.arashirep(`❌ Error: ${err.message || String(err)}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "aio downloader",
    commands: ["aio", "aiodl", "getdl"],
    categories: ["downloader"],
    description: "all-in-one downloader media (tiktok, youtube, instagram, facebook, spotify, terabox, dll)"
}

plugin.meta = {
    filename: "aio.js",
    version: "1.0",
    author: "Kado x Arashi (GetDL by IzzXd)",
    note: "All-In-One Downloader based on GetDL engine (IzzXd)",
    path: "downloader"
}

export default plugin
