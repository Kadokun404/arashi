/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { searchLyrics } from "#helper/lyrics.js"
import playPlugin from "../downloader/play.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text } = ctx

    const query = (text || "").trim()
    if (!query) {
        return await m.reply("masukkan judul lagu atau nama artis yang dicari.\ncontoh: lirik bawa dia kembali")
    }

    await m.react?.("🔍")

    try {
        const result = await searchLyrics(query)
        const { track, lyrics, copyright } = result

        let caption = `🎵 *${track.title}* — *${track.artist}*\n`
        if (track.album && track.album !== "Unknown album") {
            caption += `📀 Album: ${track.album}\n`
        }
        if (track.duration_formatted && track.duration_formatted !== "0:00") {
            caption += `⏱️ Durasi: ${track.duration_formatted}\n`
        }
        caption += `\n${lyrics}\n`
        if (copyright) {
            caption += `\n_${copyright}_`
        }

        await m.react?.("✨")

        let sentLyrics = false
        if (track.cover) {
            try {
                await sock.sendMessage(jid, {
                    image: { url: track.cover },
                    caption: caption.trim()
                }, { quoted: m })
                sentLyrics = true
            } catch {
                // fallback to text reply if image fetch fails
            }
        }

        if (!sentLyrics) {
            await m.reply(caption.trim())
        }

        // Kirim musiknya juga via plugin yp (YouTube Play Audio)
        try {
            const musicQuery = `${track.title} ${track.artist}`.trim()
            await playPlugin.run({ ...ctx, command: "yp", text: musicQuery })
        } catch (e) {
            console.error(`[lyrics] gagal kirim audio via yp:`, e)
        }
    } catch (err) {
        await m.react?.("❌")
        return await m.reply(`lirik tidak ditemukan atau terjadi kesalahan: ${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "lyrics",
    commands: ["lirik", "lyrics", "lyric"],
    categories: ["tools"],
    description: "cari lirik lagu dari Musixmatch"
}

plugin.meta = {
    filename: "lyrics.js",
    version: "1.0",
    author: "Kadokun",
    note: "Musixmatch lyrics provider",
    path: "tools"
}

export default plugin
