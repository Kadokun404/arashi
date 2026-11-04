import fs from "fs"
import path from "path"
import { askGemini } from "#helper/gemini.js"

const DIR = path.join(process.cwd(), "data")
const FILE = path.join(DIR, "gemini.json")
const LINE = "━━━━━━━━━━━━━━━━"
fs.mkdirSync(DIR, { recursive: true })

// sesi per user, disimpan ke disk supaya tidak hilang saat restart
let store = {}
try { store = JSON.parse(fs.readFileSync(FILE, "utf8")) } catch {}
const save = () => fs.writeFileSync(FILE, JSON.stringify(store))

function validSession(s) {
    try {
        const o = JSON.parse(atob(s))
        return typeof o.cookie === "string" && Array.isArray(o.resumeArray)
    } catch {
        return false
    }
}

const cleanName = n => n.replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)

// ubah Markdown Gemini jadi format WhatsApp
function fmt(t) {
    return String(t)
        // buang link googleusercontent (dan baris yang cuma berisi link itu)
        .replace(/^\s*https?:\/\/(?:[\w-]+\.)?googleusercontent\.com\/\S*\s*$/gim, "")
        .replace(/https?:\/\/(?:[\w-]+\.)?googleusercontent\.com\/\S*/gi, "")
        // garis pemisah
        .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, LINE)
        // heading: ### Judul -> *Judul*
        .replace(/^#{1,6}\s*(.+)$/gm, (_, h) => `*${h.replace(/\*/g, "").trim()}*`)
        // bullet bersarang dan bullet biasa (bold tidak kena karena tidak diikuti spasi)
        .replace(/^( {4,}|\t+)[*-]\s+/gm, "    ◦ ")
        .replace(/^\s{0,3}[*-]\s+/gm, "• ")
        // sisa **bold** -> *bold*
        .replace(/\*\*(.+?)\*\*/g, "*$1*")
        // [teks](url) -> teks (url)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
        // rapikan spasi dan baris kosong berlebih
        .replace(/[ \t]+$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

const menu =
`GEMINI
${LINE}
- g <pertanyaan>   tanya Gemini
- g -e [nama]      export sesi jadi file
- g -r             import sesi (reply file export)
- g reset          hapus sesi, mulai percakapan baru`

async function run(ctx) {
    const { m, sock, jid, q, text } = ctx
    const raw = (text || "").trim()
    const user = m.sender || m.key?.participant || jid
    const [first = "", ...rest] = raw.split(/\s+/)
    const flag = first.toLowerCase()

    // ===== g reset =====
    if (flag === "reset") {
        const had = !!store[user]
        delete store[user]
        save()
        return await m.arashirep(had
            ? `SESI DIHAPUS\n${LINE}\nPercakapan baru dimulai.`
            : `Tidak ada sesi aktif.`)
    }

    // ===== g -e [nama] =====
    if (flag === "-e") {
        if (!store[user]) return await m.arashirep("❌ Belum ada sesi untuk di-export. Tanya dulu: g <pertanyaan>")
        const name = cleanName(rest.join("-")) || `gemini-${Date.now()}`
        const data = JSON.stringify({ type: "gemini-session", name, created: Date.now(), session: store[user] })
        // file dikirim tanpa caption supaya tidak dibungkus documentWithCaption
        const sent = await sock.sendMessage(jid, {
            document: Buffer.from(data),
            mimetype: "application/json",
            fileName: `${name}.gemini.json`
        }, { quoted: m })
        await sock.sendMessage(jid, {
            text: `SESI DI-EXPORT\n${LINE}\nNama : ${name}\nImport: reply file di atas dengan "g -r"`
        }, { quoted: sent })
        return
    }

    // ===== g -r =====
    if (flag === "-r") {
        if (!q) return await m.arashirep("❌ Reply file export dengan perintah: g -r")

        let obj, step = "download"
        try {
            let buf = await (q.download?.() ?? q.quoted?.download?.())
            if (!buf) throw new Error("hasil download kosong")
            if (!Buffer.isBuffer(buf)) {
                // kalau berupa stream
                const chunks = []
                for await (const c of buf) chunks.push(c)
                buf = Buffer.concat(chunks)
            }
            step = "parse"
            obj = JSON.parse(buf.toString("utf8"))
        } catch (e) {
            return await m.arashirep(`❌ File tidak bisa dibaca (${step}): ${e.message}`)
        }
        if (obj?.type !== "gemini-session" || !validSession(obj.session)) {
            return await m.arashirep("❌ File export tidak valid")
        }
        store[user] = obj.session
        save()
        return await m.arashirep(`SESI DI-IMPORT\n${LINE}\nNama : ${obj.name || "-"}\nLanjutkan dengan: g <pertanyaan>`)
    }

    // ===== g <pertanyaan> =====
    const prompt = raw || (q?.text || "").trim()
    if (!prompt) return await m.arashirep(menu)

    await m.react("⏳")
    try {
        const { response, session } = await askGemini(prompt, store[user] || "")
        store[user] = session
        save()
        await m.arashirep(fmt(response))
        await m.react("✅")
    } catch (e) {
        await m.react("❌")
        await m.arashirep(`❌ Gagal: ${e.message}\nCoba lagi, atau ketik "g reset" jika terus error.`)
    }
}

const plugin = {
    run,
    name: "gemini",
    commands: ["g"],
    categories: ["ai"],
    description: "tanya Gemini dengan sesi percakapan. g -e export, g -r import, g reset"
}

plugin.meta = {
    filename: "gemini.js",
    version: "3",
    author: "Kado",
    note: "sesi per user di data/gemini.json, export/import via file json, output dirapikan ke format WhatsApp",
    path: "ai"
}

export default plugin