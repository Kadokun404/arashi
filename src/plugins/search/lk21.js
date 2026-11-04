import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text, prefix, command } = ctx

    const query = text?.trim() || q?.text?.trim()

    if (!query) {
        return await m.arashirep(`masukkan judul film nya kak\n\ncontoh: *${prefix ? prefix + ' ' : ''}${command} mortal kombat 2026*`)
    }

    const statusMsg = await m.arashirep(`🔎 nyari "${query}"...`)

    try {
        const res = await fetch(`https://keyrafara.com/streaming/lk21?query=${encodeURIComponent(query)}&server=auto`)
        const json = await res.json()

        if (!json.status || !json.result) {
            return await sock.sendMessage(jid, {
                text: `❌ film "${query}" gak ketemu`,
                edit: statusMsg.key
            })
        }

        const { title, poster, detail, streamUrl, embedUrl, server, serverCount } = json.result

        const synopsis = detail?.synopsis
            ? (detail.synopsis.length > 500 ? detail.synopsis.slice(0, 500) + '...' : detail.synopsis)
            : '-'

        const caption =
            `🎬 *${title}*\n\n` +
            `tahun: ${detail?.year ?? '-'}\n` +
            `rating: ${detail?.rating ?? '-'} ⭐\n` +
            `kualitas: ${detail?.quality ?? '-'} (${detail?.ageRating ?? '-'})\n` +
            `durasi: ${detail?.resolution ?? '-'}\n` +
            `negara: ${(detail?.countries || []).join(', ') || '-'}\n` +
            `genre: ${(detail?.genres || []).join(', ') || '-'}\n` +
            `sutradara: ${detail?.director ?? '-'}\n` +
            `pemain: ${(detail?.cast || []).join(', ') || '-'}\n` +
            (detail?.subtitle ? `subtitle: ${detail.subtitle}\n` : '') +
            `\n📝 ${synopsis}\n\n` +
            `server: ${(server ?? 0) + 1}/${serverCount ?? '-'}\n\n` +
            `🔗 download: ${detail?.downloadUrl || '-'}\n` +
            `▶️ stream (m3u8): ${streamUrl || embedUrl || '-'}`

        if (poster) {
            return await sock.sendMessage(jid, {
                image: { url: poster },
                caption
            }, { quoted: m.raw })
        }

        return await sock.sendMessage(jid, {
            text: caption,
            edit: statusMsg.key
        })
    } catch (err) {
        console.error(err)
        return await sock.sendMessage(jid, {
            text: `gagal ambil data film: ${err.message}`,
            edit: statusMsg.key
        })
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "lk21 movie",
    commands: ["lk21", "film"],
    categories: ["search"],
    description: "cari & ambil detail + link streaming/download film dari lk21 (powered by keyrafara)"
}

plugin.meta = {
    filename: "lk21.js",
    version: "1",
    author: config.devName,
    note: "1 endpoint langsung gabung search + detail (fuzzy match by query)",
path: "search"
}

export default plugin