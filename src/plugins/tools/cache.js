import fs from "fs"
import path from "path"

const DIR = path.join(process.cwd(), "cache", "play")
const INDEX = path.join(DIR, "index.json")
const TTL = 28 * 24 * 60 * 60 * 1000
const LINE = "━━━━━━━━━━━━━━━━"

const readIndex = () => {
    try { return JSON.parse(fs.readFileSync(INDEX, "utf8")) } catch { return {} }
}
const writeIndex = i => fs.writeFileSync(INDEX, JSON.stringify(i))
const fileOf = id => path.join(DIR, `${id}.mp3`)
const size = id => { try { return fs.statSync(fileOf(id)).size } catch { return 0 } }
const mb = b => (b / 1024 / 1024).toFixed(2) + " MB"
const sisa = t => {
    const ms = t + TTL - Date.now()
    if (ms <= 0) return "expired"
    const h = Math.floor(ms / 3600000)
    return `${Math.floor(h / 24)}h ${h % 24}j lagi`
}
const ago = t => {
    const h = Math.floor((Date.now() - t) / 3600000)
    return h < 24 ? `${h} jam lalu` : `${Math.floor(h / 24)} hari lalu`
}

async function run(ctx) {
    const { m, text, q } = ctx
    if (!ctx.isOwner) return

    fs.mkdirSync(DIR, { recursive: true })
    const args = (text || q?.text || "").trim().split(/\s+/).filter(Boolean)
    const sub = (args[0] || "").toLowerCase()
    const rest = args.slice(1).join(" ").toLowerCase()
    const index = readIndex()
    const entries = Object.entries(index)

    // cache list
    if (sub === "list") {
        if (!entries.length) return await m.arashirep("Cache kosong")
        const uniq = new Map()
        for (const [, e] of entries) uniq.set(e.id, e)
        const lines = [...uniq.values()]
            .sort((a, b) => b.time - a.time)
            .slice(0, 20)
            .map((e, i) => `${i + 1}. ${e.title}\n    ${mb(size(e.id))} | ${sisa(e.time)}`)
        return await m.arashirep(`CACHE PLAY (20 terbaru)\n${LINE}\n${lines.join("\n\n")}`)
    }

    // cache del <judul/query>
    if (sub === "del") {
        if (!rest) return await m.arashirep("Contoh: cache del disenchanted")
        const hit = entries.filter(([k, e]) => k.includes(rest) || e.title.toLowerCase().includes(rest))
        if (!hit.length) return await m.arashirep(`❌ "${rest}" tidak ada di cache`)
        const ids = new Set(hit.map(([, e]) => e.id))
        for (const id of ids) { try { fs.unlinkSync(fileOf(id)) } catch {} }
        for (const [k, e] of entries) if (ids.has(e.id)) delete index[k]
        writeIndex(index)
        const names = [...new Set(hit.map(([, e]) => e.title))]
        return await m.arashirep(`CACHE DIHAPUS\n${LINE}\nJumlah : ${ids.size} lagu\n${names.map(n => "- " + n).join("\n")}`)
    }

    // cache clear
    if (sub === "clear") {
        let n = 0, total = 0
        for (const f of fs.readdirSync(DIR)) {
            if (!f.endsWith(".mp3")) continue
            total += fs.statSync(path.join(DIR, f)).size
            fs.unlinkSync(path.join(DIR, f))
            n++
        }
        writeIndex({})
        return await m.arashirep(`CACHE DIBERSIHKAN\n${LINE}\nFile       : ${n}\nDibebaskan : ${mb(total)}`)
    }

    // cache (info)
    const files = fs.readdirSync(DIR).filter(f => f.endsWith(".mp3"))
    const total = files.reduce((a, f) => a + fs.statSync(path.join(DIR, f)).size, 0)
    const times = entries.map(([, e]) => e.time)
    const oldest = times.length ? Math.min(...times) : 0
    const newest = times.length ? Math.max(...times) : 0

    return await m.arashirep(
`CACHE PLAY
${LINE}
Lagu     : ${files.length} file
Query    : ${entries.length} entri
Ukuran   : ${mb(total)}
Terlama  : ${oldest ? ago(oldest) : "-"}
Terbaru  : ${newest ? ago(newest) : "-"}
TTL      : 28 hari
${LINE}
Perintah:
- cache list
- cache del <judul>
- cache clear`)
}

const plugin = {
    run,
    name: "cache manager",
    commands: ["cache"],
    categories: ["tools"],
    description: "lihat dan kelola cache play: info, list, del, clear"
}

plugin.meta = {
    filename: "cache.js",
    version: "2",
    author: "Kado",
    note: "kelola cache/play (index.json + mp3)",
    path: "tools"
}

export default plugin