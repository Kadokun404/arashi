/**
 * Toolkit - kumpulan util internal buat message-builder.js (AIRich)
 *
 * dulunya di port dari versi CJS (require('./toolkit')), sekarang di tulis ulang
 * full ESM biar nyambung sama sisa project ini (project ini "type": "module").
 *
 * catatan: gak semua fungsi di sini "sempurna" 1:1 kaya versi originalnya (yang
 * ketauan makenya @faridesu/baileys, fork khusus). di project ini kita cuma
 * pake "baileys" biasa, jadi beberapa fungsi (resolveMedia, mp4 duration/preview)
 * di buat best-effort & aman (gak bakal nge-crash proses walau gagal).
 */

import fs from "node:fs"

/**
 * extract inline entities (hyperlink markdown, citation [n], latex $...$)
 * dari sebuah teks, biar bisa di render rich sama whatsapp (GenAI markdown primitive)
 * @param {string} input
 * @param {{hyperlink?: boolean, citation?: boolean, latex?: boolean}} [opts]
 * @returns {{text: string, inline_entities: Array<object>}}
 */
const extractIE = (input, { hyperlink = true, citation = true, latex = true } = {}) => {
    const inline_entities = []
    let text = String(input ?? "")

    if (hyperlink) {
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url, index) => {
            inline_entities.push({
                offset: index,
                length: label.length,
                url,
                __typename: "GenAIHyperLinkInlineEntity"
            })
            return label
        })
    }

    if (citation) {
        // format citation model [1] [2] dst, biar konsisten sama nomor sumber di addSource()
        text = text.replace(/\[(\d+)\]/g, (match, num, index) => {
            inline_entities.push({
                offset: index,
                length: match.length,
                citationNumber: Number(num),
                __typename: "GenAICitationInlineEntity"
            })
            return match
        })
    }

    if (latex) {
        // inline latex $...$ (bukan block $$...$$, itu di handle addLatex() sendiri)
        text = text.replace(/\$([^$\n]+)\$/g, (match, expr, index) => {
            inline_entities.push({
                offset: index,
                length: match.length,
                latexExpression: expr,
                __typename: "GenAILatexInlineEntity"
            })
            return match
        })
    }

    // bold **text**
    text = text.replace(/\*\*([^*]+)\*\*/g, (match, content, index) => {
        inline_entities.push({
            offset: index,
            length: content.length,
            __typename: "GenAIBoldInlineEntity"
        })
        return content
    })

    return { text, inline_entities }
}

/**
 * ambil buffer dari url (via fetch bawaan node)
 * @param {string} url
 * @returns {Promise<Buffer|null>}
 */
const fetchBuffer = async (url) => {
    if (!url || typeof url !== "string") return null
    try {
        const res = await fetch(url)
        if (!res.ok) return null
        const arrBuf = await res.arrayBuffer()
        return Buffer.from(arrBuf)
    } catch {
        return null
    }
}

/**
 * resolve "media" (gambar/video/dll) jadi sesuatu yang bisa langsung di taro
 * ke payload rich message. defaultnya kalau input udah berupa url http(s),
 * itu langsung di return apa adanya (paling umum & paling ringan). kalau
 * input berupa Buffer atau path file lokal, otomatis di ubah ke base64
 * (data uri) biar tetep bisa di kirim tanpa perlu hosting eksternal.
 * @param {object} client sock/client baileys (di sediain buat kompatibilitas/future use, misal upload ke cdn wa)
 * @param {string|Buffer} input
 * @param {"image"|"video"} type
 * @param {{result?: "base64"|"url", resolveUrl?: boolean, resize?: boolean, width?: number, height?: number}} [opts]
 * @returns {string}
 */
const resolveMedia = (client, input, type = "image", opts = {}) => {
    if (!input) return ""

    // udah berupa url (http/https) -> return apa adanya, ini yang paling umum dipakai
    if (typeof input === "string" && /^https?:\/\//i.test(input)) {
        return input
    }

    // base64 / data uri yang udah jadi -> return apa adanya
    if (typeof input === "string" && input.startsWith("data:")) {
        return input
    }

    let buffer = null

    if (Buffer.isBuffer(input)) {
        buffer = input
    } else if (typeof input === "string" && fs.existsSync(input)) {
        try {
            buffer = fs.readFileSync(input)
        } catch {
            buffer = null
        }
    }

    if (!buffer) {
        // gak ketauan formatnya, balikin apa adanya (asumsi udah valid dari pemanggil)
        return typeof input === "string" ? input : ""
    }

    if (opts.result === "base64") {
        return buffer.toString("base64")
    }

    const mime = type === "video" ? "video/mp4" : "image/png"
    return `data:${mime};base64,${buffer.toString("base64")}`
}

/**
 * deep-resolve semua Promise yang ada di dalem array/object (rekursif),
 * dipake pas mau nge-build submessages/sections yang isinya ada field
 * yang di isi promise (misal durasi video yang di ambil dari buffer)
 * @param {any} value
 * @returns {Promise<any>}
 */
const waitAllPromises = async (value) => {
    const resolved = await value

    if (Array.isArray(resolved)) {
        return Promise.all(resolved.map(item => waitAllPromises(item)))
    }

    if (resolved && typeof resolved === "object" && !Buffer.isBuffer(resolved)) {
        const entries = await Promise.all(
            Object.entries(resolved).map(async ([key, val]) => [key, await waitAllPromises(val)])
        )
        return Object.fromEntries(entries)
    }

    return resolved
}

/**
 * ambil durasi video (detik) dari buffer mp4. best-effort: kalau ffprobe
 * gak ke detect di environment, aman return 0 (gak nge-throw)
 * @param {Buffer|null} buffer
 * @param {{silent?: boolean}} [opts]
 * @returns {Promise<number>}
 */
const getMp4Duration = async (buffer, { silent = true } = {}) => {
    if (!buffer) return 0
    try {
        const { execFileSync } = await import("node:child_process")
        const os = await import("node:os")
        const path = await import("node:path")
        const tmpFile = path.join(os.tmpdir(), `mina-mp4-${Date.now()}.mp4`)
        fs.writeFileSync(tmpFile, buffer)
        try {
            const out = execFileSync("ffprobe", [
                "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", tmpFile
            ]).toString().trim()
            return Math.round(Number(out)) || 0
        } finally {
            fs.rmSync(tmpFile, { force: true })
        }
    } catch (err) {
        if (!silent) console.warn("[toolkit] gagal ambil durasi mp4:", err.message)
        return 0
    }
}

/**
 * ambil frame preview (thumbnail) dari buffer mp4. best-effort: kalau
 * ffmpeg gak ke detect, aman return null (gak nge-throw)
 * @param {Buffer|null} buffer
 * @param {{time?: number, result?: "base64"}} [opts]
 * @returns {Promise<string|null>}
 */
const getMp4Preview = async (buffer, { time = 0, result = "base64" } = {}) => {
    if (!buffer) return null
    try {
        const { execFileSync } = await import("node:child_process")
        const os = await import("node:os")
        const path = await import("node:path")
        const inFile = path.join(os.tmpdir(), `mina-mp4-in-${Date.now()}.mp4`)
        const outFile = path.join(os.tmpdir(), `mina-mp4-out-${Date.now()}.jpg`)
        fs.writeFileSync(inFile, buffer)
        try {
            execFileSync("ffmpeg", ["-y", "-ss", String(time), "-i", inFile, "-frames:v", "1", outFile])
            const img = fs.readFileSync(outFile)
            return result === "base64" ? img.toString("base64") : img
        } finally {
            fs.rmSync(inFile, { force: true })
            fs.rmSync(outFile, { force: true })
        }
    } catch {
        return null
    }
}

const Toolkit = {
    extractIE,
    fetchBuffer,
    resolveMedia,
    waitAllPromises,
    getMp4Duration,
    getMp4Preview,
}

export { Toolkit }
export default Toolkit
