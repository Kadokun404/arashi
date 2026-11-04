/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

const PASTEBIN_REGEX = /pastebin\.com\/(?:raw\/)?([a-zA-Z0-9]+)/i
const ID_REGEX = /^[a-zA-Z0-9]{4,16}$/
const MAX_CHARS = 4000
const MAX_LINES = 90
const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

const USAGE =
    "*Pastebin Getter*\n" +
    "Fetch raw text from a Pastebin link or ID.\n\n" +
    "Usage:\n" +
    "  .paste <link/id>\n" +
    "  Reply to a message containing a link, then send .paste\n\n" +
    "Example:\n" +
    "  .paste https://pastebin.com/rTe3D23a\n" +
    "  .paste rTe3D23a"

/**
 * Extract a paste ID from a link or a bare ID.
 * @param {string} input
 * @returns {string | null}
 */
function extractPasteId(input) {
    const raw = String(input || "").trim()
    if (!raw) return null

    const match = raw.match(PASTEBIN_REGEX)
    if (match) return match[1]

    const token = raw.split(/\s+/)[0]
    return ID_REGEX.test(token) ? token : null
}

/**
 * @param {string} id
 * @returns {Promise<string>}
 */
async function fetchPaste(id) {
    const res = await fetch(`https://pastebin.com/raw/${id}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(15_000)
    })

    if (res.status === 404) throw new Error("Paste not found, deleted, or private.")
    if (!res.ok) throw new Error(`Request failed (HTTP ${res.status}).`)

    const content = await res.text()
    if (!content.trim()) throw new Error("Paste is empty.")
    return content
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text, q } = ctx

    const id = extractPasteId(text || q?.text)
    if (!id) return await m.arashirep(USAGE)

    await m.react("⏳")

    try {
        const content = await fetchPaste(id)
        const chars = content.length
        const lines = content.split("\n").length

        const header =
            `*Pastebin ${id}*\n` +
            `${chars.toLocaleString("en-US")} characters, ${lines} lines\n` +
            `https://pastebin.com/${id}`

        if (chars > MAX_CHARS || lines > MAX_LINES) {
            await sock.sendMessage(
                jid,
                {
                    document: Buffer.from(content, "utf8"),
                    mimetype: "text/plain",
                    fileName: `paste_${id}.txt`,
                    caption: `${header}\n\nToo long for chat, sent as a file.`
                },
                { quoted: m }
            )
        } else {
            await m.arashirep(`${header}\n\n\`\`\`\n${content}\n\`\`\``)
        }

        await m.react("✅")
    } catch (err) {
        await m.react("❌")
        await m.arashirep(`Failed to fetch paste: ${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "pastebin getter",
    commands: ["paste", "pastebin", "pb"],
    categories: ["tools"],
    description: "fetch raw text from a pastebin link or id"
}

plugin.meta = {
    filename: "pastebin.js",
    version: "2.1",
    author: "Kadokun x Arashi",
    note: "Simple raw pastebin getter (no API key required)",
    path: "tools"
}

export default plugin