/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { config } from "#root/config.js"
import { AnichinScraper } from "#helper/anichin.js"

const LINE = "━━━━━━━━━━━━━━━━"
const CHUNK_LIMIT = 3500 // batas karakter per pesan
const EP_PREVIEW = 15 // jumlah episode yang ditampilkan di detail (tanpa -all)

const scraper = new AnichinScraper()

const SUBS = {
    latest: ["latest", "terbaru", "new"],
    search: ["search", "cari"],
    schedule: ["schedule", "jadwal"],
    detail: ["detail", "info"],
    episode: ["episode", "ep"]
}
const epLabel = e => !e ? "Ep -" : /^ep/i.test(e) ? e : `Ep ${e}`
const subName = word => Object.keys(SUBS).find(k => SUBS[k].includes(word))

/** kirim beberapa blok teks, otomatis dipecah kalau kepanjangan */
async function sendChunks(m, header, blocks) {
    const chunks = []
    let cur = header
    for (const b of blocks) {
        if (cur !== header && (cur + "\n\n" + b).length > CHUNK_LIMIT) {
            chunks.push(cur)
            cur = b
        } else {
            cur += "\n\n" + b
        }
    }
    chunks.push(cur)
    for (const c of chunks) await m.arashirep(c)
}

const listBlocks = items => items.map((it, i) =>
    `${i + 1}. ${it.title}\n   ${epLabel(it.episode)} • ${it.type || "-"} • ${it.status || "-"}\n   ${it.url}`
)

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, sock, jid, text, prefix, command } = ctx
    const p = `${prefix ?? ""}${command}`
    const raw = (text || "").trim()

    if (!raw) {
        return await m.arashirep(
            `ANICHIN\n${LINE}\n` +
            `${p} latest [halaman]\n  episode terbaru\n\n` +
            `${p} search <judul> [-p halaman]\n  cari donghua\n\n` +
            `${p} schedule\n  jadwal rilis mingguan\n\n` +
            `${p} detail <url / slug> [-all]\n  info seri + daftar episode\n\n` +
            `${p} episode <url / slug>\n  server streaming + link download\n\n` +
            `tips: kirim url langsung (${p} <url>), otomatis dikenali`
        )
    }

    const isAll = /(?:^|\s)-all(?=\s|$)/.test(raw)
    const pageFlag = raw.match(/(?:^|\s)-p\s+(\d+)(?=\s|$)/)
    const body = raw
        .replace(/(?:^|\s)-all(?=\s|$)/g, " ")
        .replace(/(?:^|\s)-p\s+\d+(?=\s|$)/g, " ")
        .trim()

    const [first, ...restWords] = body.split(/\s+/)
    let sub = subName((first || "").toLowerCase())
    let arg = restWords.join(" ")

    if (!sub && /^https?:\/\//i.test(first || "")) {
        sub = /episode|-ep-\d+/i.test(first) ? "episode" : "detail"
        arg = body
    }

    if (!sub) return await m.arashirep(`❌ subcommand tidak dikenal, ketik ${p} untuk bantuan`)

    await m.react("⏳")
    try {
        if (sub === "latest") {
            const page = pageFlag ? Number(pageFlag[1]) : (parseInt(arg, 10) || 1)
            const res = await scraper.getLatest(page)
            if (!res.count) throw new Error("tidak ada data, struktur situs mungkin berubah")

            await sendChunks(m,
                `DONGHUA TERBARU (halaman ${res.page})\n${LINE}`,
                [...listBlocks(res.data), res.hasNext ? `halaman berikutnya: ${p} latest ${res.page + 1}` : "halaman terakhir"]
            )
        }

        else if (sub === "search") {
            if (!arg) throw new Error(`masukkan judul, contoh: ${p} search renegade`)
            const res = await scraper.search(arg, pageFlag ? Number(pageFlag[1]) : 1)
            if (!res.count) throw new Error(`"${res.query}" tidak ditemukan`)

            await sendChunks(m,
                `HASIL PENCARIAN: ${res.query} (halaman ${res.page})\n${LINE}`,
                listBlocks(res.data)
            )
        }

        else if (sub === "schedule") {
            const schedule = await scraper.getSchedule()
            const days = Object.keys(schedule)
            if (!days.length) throw new Error("jadwal tidak ditemukan, struktur situs mungkin berubah")

            await sendChunks(m,
                `JADWAL RILIS\n${LINE}`,
                days.map(d => `*${d}*\n` + schedule[d].map(it => `- ${it.title}\n  ${it.url}`).join("\n"))
            )
        }

        else if (sub === "detail") {
            if (!arg) throw new Error(`masukkan url atau slug, contoh: ${p} detail renegade-immortal`)
            const d = await scraper.getDetail(arg)

            const metaKeys = ["status", "type", "country", "network", "studio", "duration", "season", "released", "episodes"]
            const metaLines = metaKeys
                .filter(k => d.metadata[k])
                .map(k => `${k[0].toUpperCase() + k.slice(1)} : ${d.metadata[k]}`)

            const caption =
                `${d.title}\n${LINE}\n` +
                (metaLines.length ? metaLines.join("\n") + "\n" : "") +
                (d.genres.length ? `Genre : ${d.genres.join(", ")}\n` : "") +
                (d.synopsis ? `\n${d.synopsis.slice(0, 500)}${d.synopsis.length > 500 ? "..." : ""}\n` : "") +
                `\n${d.url}`

            if (d.thumbnail) {
                try {
                    await sock.sendMessage(jid, { image: { url: d.thumbnail }, caption }, { quoted: m.raw })
                } catch {
                    await m.arashirep(caption)
                }
            } else {
                await m.arashirep(caption)
            }

            if (d.episodeCount) {
                const shown = isAll ? d.episodes : d.episodes.slice(0, EP_PREVIEW)
                const blocks = shown.map(e =>
                    `${epLabel(e.episode)}${e.title ? ` • ${e.title}` : ""}${e.releaseDate ? ` (${e.releaseDate})` : ""}\n${e.url}`
                )
                if (!isAll && d.episodeCount > EP_PREVIEW) {
                    blocks.push(`menampilkan ${EP_PREVIEW} dari ${d.episodeCount}, tambah -all untuk semuanya`)
                }
                await sendChunks(m, `DAFTAR EPISODE (${d.episodeCount})\n${LINE}`, blocks)
            }
        }

        else if (sub === "episode") {
            if (!arg) throw new Error(`masukkan url atau slug episode, contoh: ${p} episode <url episode>`)
            const e = await scraper.getEpisode(arg)

            const head =
                `${e.title}\n${LINE}\n` +
                (e.seriesTitle ? `Series : ${e.seriesTitle}\n` : "") +
                e.url

            const blocks = []

            if (e.servers.length) {
                blocks.push(`SERVER STREAMING (${e.serverCount})\n` + e.servers.map((s, i) => `${i + 1}. ${s.name}\n   ${s.iframeUrl}`).join("\n"))
            } else if (e.defaultIframe) {
                blocks.push(`PLAYER\n${e.defaultIframe}`)
            }

            for (const d of e.downloads) {
                if (!d.links.length) continue
                blocks.push(`DOWNLOAD ${d.quality}\n` + d.links.map(l => `- ${l.host}: ${l.url}`).join("\n"))
            }

            const nav = []
            if (e.prevEpisode) nav.push(`Sebelumnya : ${e.prevEpisode}`)
            if (e.nextEpisode) nav.push(`Selanjutnya : ${e.nextEpisode}`)
            if (nav.length) blocks.push(nav.join("\n"))

            if (!blocks.length) throw new Error("server/link download tidak ditemukan, struktur situs mungkin berubah")
            await sendChunks(m, head, blocks)
        }

        await m.react("✅")
    } catch (err) {
        await m.react("❌")
        return await m.arashirep(`❌ ${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "anichin",
    commands: ["anichin"],
    categories: ["search"],
    description: "info donghua dari anichin: terbaru, cari, jadwal, detail seri, dan link episode"
}

plugin.meta = {
    filename: "anichin.js",
    version: "1",
    author: config.devName,
    note: "scraper html anichin.moe, tanpa puppeteer",
    path: "search"
}

export default plugin
