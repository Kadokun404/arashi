/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { config } from "#root/config.js"

const TOKEN = config.apikey.github
const API = "https://api.github.com"
const LINE = "━━━━━━━━━━━━━━━━"
const DOC_LIMIT = 3000
const GIST_ID_REGEX = /gist\.github\.com\/(?:[\w-]+\/)?([0-9a-f]+)/i

async function gh(path, opts = {}) {
    if (!TOKEN || TOKEN.startsWith("TOKEN_")) {
        throw new Error("token github belum diisi di config.js (apikey.github)")
    }
    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "arashi-bot",
            "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(30000)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
    return data
}

async function fetchRaw(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`gagal ambil file (http ${res.status})`)
    return await res.text()
}

function parseFlags(raw) {
    const isPublic = /(?:^|\s)-p\s+public(?=\s|$)/i.test(raw)
    const asDoc = /(?:^|\s)-d(?=\s|$)/.test(raw)
    const text = raw
        .replace(/(?:^|\s)-p(?:\s+(?:public|secret|private))?(?=\s|$)/gi, " ")
        .replace(/(?:^|\s)-d(?=\s|$)/g, " ")
        .trim()
    return { text, isPublic, asDoc }
}

async function getContent(ctx) {
    const { q } = ctx
    if (!q) return null
    if (q.content === "documentMessage") {
        const buf = await q.download("buffer")
        return buf.toString("utf8")
    }
    let raw = q.text || ""
    raw = raw.replace(/^https?:\/\/arashi\.kadokun\.com\s*/i, "").trim()
    const fence = raw.match(/^```[\w-]*\n?([\s\S]*?)```$/i)
    if (fence) raw = fence[1].trim()
    return raw || null
}

function matchFiles(gists, query) {
    const q = query.toLowerCase()
    for (const g of gists) {
        if (g.id.toLowerCase() === q) return Object.values(g.files)
    }
    for (const g of gists) {
        const f = Object.values(g.files).find(f => f.filename.toLowerCase() === q)
        if (f) return [f]
    }
    for (const g of gists) {
        const f = Object.values(g.files).find(f => f.filename.toLowerCase().includes(q))
        if (f) return [f]
    }
    if (/^\d+$/.test(q) && gists[Number(q) - 1]) {
        return Object.values(gists[Number(q) - 1].files)
    }
    return null
}

async function sendFiles({ m, sock, jid }, files, asDoc) {
    for (const f of files) {
        const content = await fetchRaw(f.raw_url)
        if (asDoc || content.length > DOC_LIMIT) {
            await sock.sendMessage(jid, {
                document: Buffer.from(content, "utf8"),
                mimetype: "text/plain",
                fileName: f.filename
            }, { quoted: m })
        } else {
            await m.arashirep(`${f.filename}\n${LINE}\n\`\`\`${content}\`\`\``)
        }
    }
}

async function run(ctx) {
    const { m, text } = ctx
    const [sub, ...rest] = (text || "").trim().split(/\s+/)
    const subLower = (sub || "").toLowerCase()
    const arg = rest.join(" ")

    try {
        if (subLower === "create") {
            const { text: nameRaw, isPublic } = parseFlags(arg)
            const base = (nameRaw || `gist-${Date.now()}`).replace(/\s+/g, "-")
            const filename = base.includes(".") ? base : `${base}.txt`

            const code = await getContent(ctx)
            if (!code) return await m.arashirep("reply text/code/file yang mau di-gist, contoh:\ngist create arashi.js\n(reply pesan/code/file)")

            await m.react("⏳")
            const data = await gh("/gists", {
                method: "POST",
                body: JSON.stringify({
                    description: filename,
                    public: isPublic,
                    files: { [filename]: { content: code } }
                })
            })
            await m.react("✅")
            return await m.arashirep(`GIST DIBUAT\n${LINE}\nFile  : ${filename}\nTipe  : ${isPublic ? "public" : "secret"}\nLink  : ${data.html_url}`)
        }

        if (subLower === "list") {
            const gists = await gh("/gists?per_page=20")
            if (!gists.length) return await m.arashirep("belum ada gist")
            const lines = gists.map((g, i) => {
                const names = Object.keys(g.files).join(", ")
                return `${i + 1}. ${names}${g.public ? "" : " (secret)"}\n   ${g.html_url}`
            })
            return await m.arashirep(`DAFTAR GIST (${gists.length})\n${LINE}\n${lines.join("\n")}`)
        }

        if (subLower === "open") {
            const { text: query, asDoc } = parseFlags(arg)
            if (!query) return await m.arashirep("contoh: gist open arashi.js\natau: gist open 1 (nomor dari gist list)")
            await m.react("⏳")
            const gists = await gh("/gists?per_page=100")
            const files = matchFiles(gists, query)
            if (!files) {
                await m.react("❌")
                return await m.arashirep(`❌ gist "${query}" gak ketemu, cek gist list`)
            }
            await sendFiles(ctx, files, asDoc)
            return await m.react("✅")
        }

        if (subLower === "get") {
            const { text: input, asDoc } = parseFlags(arg || ctx.q?.text || "")
            const id = input.match(GIST_ID_REGEX)?.[1] || input.match(/^[0-9a-f]{20,}$/i)?.[0]
            if (!id) return await m.arashirep("contoh: gist get https://gist.github.com/user/xxxxxxxx\n(atau reply pesan yang ada link gist-nya)")
            await m.react("⏳")
            const data = await gh(`/gists/${id}`)
            const files = Object.values(data.files || {})
            if (!files.length) throw new Error("gist ini kosong")
            await sendFiles(ctx, files, asDoc)
            return await m.react("✅")
        }

        return await m.arashirep(
`GIST
${LINE}
gist create <nama.ext> [-p public]
  (reply text/code/file)
gist list
gist open <nama file | nomor | id> [-d]
gist get <link gist | id> [-d]

-d = kirim sebagai dokumen
default create = secret`
        )
    } catch (e) {
        await m.react("❌")
        return await m.arashirep(`❌ ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "gist",
    commands: ["gist"],
    categories: ["tools"],
    description: "kelola gist github: create, list, open, get"
}

plugin.meta = {
    filename: "gist.js",
    version: "1",
    author: "Kado",
    note: "pakai config.apikey.github, create default secret, -d kirim dokumen",
    path: "tools"
}

export default plugin
