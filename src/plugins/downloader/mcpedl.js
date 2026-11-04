/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import vm from "node:vm"

const WEB_BASE = "https://mcpedl.com"
const API_BASE = "https://api.mcpedl.com"
const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const MAX_SIZE = 100 * 1024 * 1024 // 100mb
const URL_REGEX = /https?:\/\/(?:www\.)?mcpedl\.com\/([^\s/?#]+)/i

/**
 * @param {string} url
 * @param {boolean} json
 */
async function get(url, json = false) {
    const res = await fetch(url, {
        headers: { "User-Agent": UA, accept: "application/json, text/html, */*" },
        signal: AbortSignal.timeout(25000)
    })
    if (!res.ok) throw new Error(`http ${res.status}`)
    return json ? res.json() : res.text()
}

/** @param {string} html */
function parseNuxt(html) {
    const match = html.match(
        /window\.__NUXT__\s*=\s*(\(function[\s\S]*?\}\s*\([\s\S]*?\)\s*\);?)/
    )
    if (!match) throw new Error("data tidak ditemukan (mungkin cloudflare)")
    const code = `"use strict"; const result = ${match[1].replace(/;?\s*$/, "")}; result;`
    const ctx = vm.createContext(Object.create(null))
    return new vm.Script(code, { timeout: 8000 }).runInContext(ctx)
}

/** @param {string} slug */
async function getProject(slug) {
    const html = await get(`${WEB_BASE}/${slug}/`)
    const model = parseNuxt(html)?.state?.slug?.model
    if (!model?.slug) throw new Error(`project "${slug}" tidak ditemukan`)

    const seen = new Set()
    const downloads = []
    const list = [...(model.downloads || [])].sort(
        (a, b) => (a.type ?? 99) - (b.type ?? 99)
    )

    for (const item of list) {
        let file = item.file
        if (!file) continue
        if (file.includes("/leaving") && file.includes("url=")) {
            try {
                file = decodeURIComponent(
                    new URL(file, WEB_BASE).searchParams.get("url") || file
                )
            } catch { /* keep */ }
        }
        if (seen.has(file)) continue
        seen.add(file)
        downloads.push({ name: item.display_name || item.name || "file", file })
    }

    return {
        slug: model.slug,
        title: model.title || slug,
        type_id: model.type_id,
        author: model.user?.display_name || model.display_name || "-",
        rating: model.average_rating != null ? Number(model.average_rating).toFixed(1) : "-",
        versions: (model.minecraft_versions || []).map((v) => v.name || v.version || v),
        downloads,
        url: `${WEB_BASE}/${model.slug}/`
    }
}

/** @param {string} keyword */
async function search(keyword) {
    const u = new URL("/api/search/advanced", API_BASE)
    u.searchParams.set("keyword", keyword)
    u.searchParams.set("sort", "relevance")
    u.searchParams.set("page", "1")
    u.searchParams.set("page_size", "5")
    const data = await get(u.href, true)
    return (data.results || []).map((r) => ({
        title: r.title,
        slug: r.slug,
        downloads: r.downloadCount ?? r.download_count,
        url: `${WEB_BASE}/${r.slug}/`
    }))
}

/**
 * @param {string} file
 * @param {string} slug
 */
async function downloadFile(file, slug) {
    const res = await fetch(file, {
        headers: { "User-Agent": UA },
        redirect: "follow",
        signal: AbortSignal.timeout(120000)
    })
    if (!res.ok) throw new Error(`download http ${res.status}`)

    const type = res.headers.get("content-type") || ""
    if (type.includes("text/html")) {
        return { external: true }
    }

    const len = Number(res.headers.get("content-length") || 0)
    if (len > MAX_SIZE) {
        throw new Error(`file kegedean (${(len / 1048576).toFixed(1)}mb, max 100mb)`)
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > MAX_SIZE) {
        throw new Error(`file kegedean (${(buffer.length / 1048576).toFixed(1)}mb, max 100mb)`)
    }

    let fileName = ""
    const cd = res.headers.get("content-disposition") || ""
    const cdName = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1]
    if (cdName) {
        try { fileName = decodeURIComponent(cdName) } catch { fileName = cdName }
    }
    if (!fileName) {
        try {
            fileName = decodeURIComponent(
                new URL(res.url || file).pathname.split("/").pop() || ""
            )
        } catch { /* ignore */ }
    }
    if (!fileName || !/\.[a-z0-9]{2,8}$/i.test(fileName)) {
        fileName = `${slug}.zip`
    }

    return { external: false, buffer, fileName }
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, sock, jid, q, text, command, prefix } = ctx

    const input = (text || q?.text || "").trim()
    const p = `${prefix ?? ""}${command}`

    if (!input) {
        return m.arashirep(
            `# cara penggunaan\n\n` +
            `> kirim url mcpedl atau kata kunci buat cari\n` +
            `> tambah nomor di belakang url buat pilih file download\n\n` +
            `# contoh\n` +
            `> ${p} https://mcpedl.com/slug-project/\n` +
            `> ${p} https://mcpedl.com/slug-project/ 2\n` +
            `> ${p} shader`
        )
    }

    await m.react("⏳")

    try {
        const slug = input.match(URL_REGEX)?.[1]

        // mode cari
        if (!slug) {
            const results = await search(input)
            if (!results.length) {
                await m.react("❌")
                return m.arashirep(`❌ ga nemu hasil buat "${input}"`)
            }
            const lines = results.map(
                (r, i) => `${i + 1}. ${r.title}\n   ${r.url}`
            )
            await m.react("✅")
            return m.arashirep(
                `hasil cari "${input}"\n\n${lines.join("\n\n")}\n\n` +
                `kirim ulang: ${p} <url>`
            )
        }

        // mode download
        const idx = Math.max(
            1,
            Number(input.replace(URL_REGEX, "").trim().split(/\s+/)[0]) || 1
        )

        const project = await getProject(slug)
        if (!project.downloads.length) {
            await m.react("❌")
            return m.arashirep(`❌ ${project.title} ga punya link download`)
        }

        const target = project.downloads[idx - 1] || project.downloads[0]
        const result = await downloadFile(target.file, project.slug)

        if (result.external) {
            await m.react("✅")
            return m.arashirep(
                `link download ada di situs eksternal, ga bisa dikirim langsung\n\n` +
                `${project.title}\n${target.file}`
            )
        }

        const caption =
            `${project.title}\n` +
            `by ${project.author} | ★${project.rating}\n` +
            (project.versions.length ? `versi: ${project.versions.join(", ")}\n` : "") +
            (project.downloads.length > 1
                ? `file ${project.downloads.indexOf(target) + 1}/${project.downloads.length}\n`
                : "") +
            `${project.url}`

        await sock.sendMessage(
            jid,
            {
                document: result.buffer,
                mimetype: "application/zip",
                fileName: result.fileName,
                caption
            },
            { quoted: m }
        )
        await m.react("✅")
    } catch (err) {
        await m.react("❌")
        return m.arashirep(`❌ gagal\n\n${err?.message || "error"}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "mcpedl",
    commands: ["mcpedl", "mcpe"],
    categories: ["downloader"],
    description: "cari dan download addon/world/texture dari mcpedl.com, dikirim sebagai file"
}

plugin.meta = {
    filename: "mcpedl.js",
    version: "1.0",
    author: "Kadokun",
    path: "downloader",
    note: "url mcpedl dikirim sebagai dokumen, keyword menampilkan hasil cari"
}

export default plugin