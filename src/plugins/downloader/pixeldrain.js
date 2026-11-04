/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

const LINE = "━━━━━━━━━━━━━━━━"
const MAX_MB = 300
const RE = /pixeldrain\.(?:com|net)\/(?:u|api\/file)\/(\w+)/i

const mb = b => (b / 1024 / 1024).toFixed(2) + " MB"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, sock, jid, q, text } = ctx

    const raw = `${text || ""} ${q?.text || ""}`
    const id = (raw.match(RE) || [])[1]
    const asDoc = /(^|\s)-d(\s|$)/.test(raw)

    if (!id) {
        return await m.arashirep(
`
- pd <link>
- reply link dengan pd
- pd <link> -d  kirim sebagai dokumen`)
    }

    await m.react("🔎")

    let info
    try {
        const res = await fetch(`https://pixeldrain.com/api/file/${id}/info`)
        info = await res.json().catch(() => null)
        if (!res.ok || !info) {
            await m.react("❌")
            return await m.arashirep(`❌ File tidak ditemukan (HTTP ${res.status})`)
        }
    } catch {
        await m.react("❌")
        return await m.arashirep("❌ Gagal konek ke pixeldrain, coba lagi bentar ya")
    }

    if (info.availability) {
        await m.react("❌")
        return await m.arashirep(`❌ File terkunci: ${info.availability}`)
    }

    if (info.size > MAX_MB * 1024 * 1024) {
        await m.react("❌")
        return await m.arashirep(
`FILE TERLALU BESAR
${LINE}
Nama   : ${info.name}
Ukuran : ${mb(info.size)}
Batas  : ${MAX_MB} MB`)
    }

    await m.react("⏳")

    const url = `https://pixeldrain.com/api/file/${id}?download`
    const mime = info.mime_type || "application/octet-stream"
    const caption = `${info.name}\n${LINE}\nUkuran : ${mb(info.size)}`

    let content
    if (asDoc) content = { document: { url }, mimetype: mime, fileName: info.name }
    else if (mime.startsWith("video/")) content = { video: { url }, mimetype: mime, caption }
    else if (mime.startsWith("image/")) content = { image: { url }, caption }
    else if (mime.startsWith("audio/")) content = { audio: { url }, mimetype: mime }
    else content = { document: { url }, mimetype: mime, fileName: info.name }

    try {
        await sock.sendMessage(jid, content, { quoted: m })
        await m.react("✅")
    } catch (e) {
        await m.react("❌")
        await m.arashirep(`❌ Gagal kirim: ${e.message}\nCoba pakai flag -d untuk kirim sebagai dokumen`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "pixeldrain downloader",
    commands: ["pd", "pixeldrain"],
    categories: ["downloader"],
    description: "download file pixeldrain dari link atau reply link. -d kirim sebagai dokumen"
}

plugin.meta = {
    filename: "pixeldrain.js",
    version: "1",
    author: "Kado",
    note: "api pixeldrain /info + direct download, tipe kirim otomatis dari mimetype",
    path: "downloader"
}

export default plugin