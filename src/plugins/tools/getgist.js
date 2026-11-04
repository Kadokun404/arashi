import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

const GIST_ID_REGEX = /gist\.github\.com\/(?:[\w-]+\/)?([0-9a-f]+)/i
const GITHUB_BLOB_REGEX = /github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([^/]+)\/(.+)/i
const GITHUB_RAW_REGEX = /raw\.githubusercontent\.com\/([\w.-]+)\/([\w.-]+)\/([^/]+)\/(.+)/i

const COPY_LIMIT = 60000 // batas aman buttonParamsJson, di atas ini kirim sebagai file aja

/**
 * ubah berbagai bentuk link jadi daftar { name, rawUrl } yang mau diambil
 * @param {string} url
 * @returns {Promise<{name: string, rawUrl: string}[]>}
 */
async function resolveFiles(url) {
    const gistMatch = url.match(GIST_ID_REGEX)
    if (gistMatch) {
        const id = gistMatch[1]
        const res = await fetch(`https://api.github.com/gists/${id}`, {
            headers: { "user-agent": "bot" }
        })
        if (!res.ok) throw new Error(`gist gak ketemu (http ${res.status})`)
        const data = await res.json()
        const files = Object.values(data.files || {})
        if (!files.length) throw new Error("gist ini kosong")
        return files.map(f => ({ name: f.filename, rawUrl: f.raw_url }))
    }

    const blobMatch = url.match(GITHUB_BLOB_REGEX)
    if (blobMatch) {
        const [, owner, repo, branch, path] = blobMatch
        return [{
            name: path.split("/").pop(),
            rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
        }]
    }

    const rawMatch = url.match(GITHUB_RAW_REGEX)
    if (rawMatch) {
        return [{ name: url.split("/").pop(), rawUrl: url }]
    }

    throw new Error("link gak dikenali, pakai link gist.github.com atau github.com/.../blob/...")
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, sock, jid, q, text, command, prefix } = ctx

    const input = text || q?.text || ""
    const asDoc = /(^|\s)-d(\s|$)/.test(input)
    const cleanInput = input.replace(/(^|\s)-d(?=\s|$)/g, " ").trim()
    const url = cleanInput.match(/https?:\/\/\S+/)?.[0]

    if (!url) {
        return m.arashirep(
            `# cara penggunaan\n\n` +
            `> masukin link gist atau github file, atau reply pesan yang ada link-nya\n` +
            `> tambahin -d buat kirim sebagai dokumen\n\n` +
            `# contoh\n` +
            `> ${prefix ?? ""}${command} https://gist.github.com/user/xxxxxxxx\n` +
            `> ${prefix ?? ""}${command} https://github.com/user/repo/blob/main/file.js -d`
        )
    }

    await m.react("⏳")

    try {
        const files = await resolveFiles(url)

        for (const file of files) {
            const res = await fetch(file.rawUrl, { signal: AbortSignal.timeout(30000) })
            if (!res.ok) throw new Error(`gagal ambil ${file.name} (http ${res.status})`)
            const content = await res.text()

            if (asDoc || content.length > COPY_LIMIT) {
                await sock.sendMessage(jid, {
                    document: Buffer.from(content, "utf8"),
                    mimetype: "text/plain",
                    fileName: file.name
                }, { quoted: m })
                continue
            }

            await sock.relayMessage(
                jid,
                {
                    interactiveMessage: {
                        header: { title: file.name },
                        body: {
                            text: `\`\`\`${content.slice(0, 2000)}\`\`\`${content.length > 2000 ? "\n\n_(terpotong, salin buat liat full)_" : ""}`
                        },
                        footer: { text: `${content.split("\n").length} baris • ${content.length} karakter` },
                        nativeFlowMessage: {
                            buttons: [
                                {
                                    name: "cta_copy",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "salin code",
                                        copy_code: content
                                    })
                                },
                                {
                                    name: "cta_url",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "buka link",
                                        url
                                    })
                                }
                            ]
                        },
                        contextInfo: {
                            stanzaId: m.key.id,
                            participant: m.key.participant || m.key.remoteJid,
                            quotedMessage: m.message
                        }
                    }
                },
                {
                    additionalNodes: [
                        {
                            tag: "biz",
                            attrs: {},
                            content: [
                                {
                                    tag: "interactive",
                                    attrs: { type: "native_flow", v: "1" },
                                    content: [
                                        { tag: "native_flow", attrs: { v: "9", name: "mixed" } }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            )
        }

        await m.react("✅")
    } catch (err) {
        await m.react("❌")
        return m.arashirep(`❌ gagal ambil gist\n\n${err?.message || "error"}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "getgist",
    commands: ["getgist", "gitgist"],
    categories: ["tools"],
    description: "ambil isi gist atau file github, hasil dikirim dengan tombol salin code. -d buat kirim sebagai dokumen"
}

plugin.meta = {
    filename: "getgist.js",
    version: "1.1",
    author: "Kadokun",
    path: "tools",
    note: "support multi-file gist, -d buat paksa kirim dokumen, file besar (>60rb karakter) otomatis dikirim sebagai dokumen",
    path: "tools"
}

export default plugin