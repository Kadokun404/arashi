/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { allPaths } from '../../all-paths.js'
import { config } from "#root/config.js"

const execFilePromise = promisify(execFile)

// regex buat nangkep "owner/repo" simple, gak boleh ada spasi/slash berlebih
const OWNER_REPO_REGEX = /^[\w.-]+\/[\w.-]+$/

// regex buat nangkep url github lengkap, dengan atau tanpa .git, http(s) opsional
const GITHUB_URL_REGEX = /^(https?:\/\/)?(www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/i

/**
 * normalize input user (owner/repo ATAU url lengkap) jadi { owner, repo, cloneUrl }
 * @param {string} input
 * @returns {{ owner: string, repo: string, cloneUrl: string } | undefined}
 */
function parseRepoInput(input) {
    if (!input) return undefined
    const trimmed = input.trim()

    // format url lengkap
    const urlMatch = trimmed.match(GITHUB_URL_REGEX)
    if (urlMatch) {
        const owner = urlMatch[3]
        const repo = urlMatch[4]
        return { owner, repo, cloneUrl: `https://github.com/${owner}/${repo}.git` }
    }

    // format owner/repo
    if (OWNER_REPO_REGEX.test(trimmed)) {
        const [owner, repo] = trimmed.split('/')
        return { owner, repo, cloneUrl: `https://github.com/${owner}/${repo}.git` }
    }

    return undefined
}

/**
 * handler buat "git clone <owner/repo | url>"
 * @param {PluginCtx} ctx
 * @param {string} input
 */
async function handleClone(ctx, input) {
    const { sock, jid, m } = ctx

    const parsed = parseRepoInput(input)
    if (!parsed) {
        return await m.arashirep(
            `format salah kak, contoh:\n` +
            `\`git clone wolfyFlutter/angelina-bot\`\n` +
            `atau\n` +
            `\`git clone https://github.com/wolfyFlutter/angelina-bot\``
        )
    }

    const { owner, repo, cloneUrl } = parsed
    const workId = randomUUID()
    const cloneDir = path.join(allPaths.temp, `git-${workId}`, repo)
    const zipPath = path.join(allPaths.temp, `git-${workId}.zip`)

    await m.arashirep(`⏳ cloning *${owner}/${repo}*...`)

    try {
        await mkdir(path.dirname(cloneDir), { recursive: true })

        // shallow clone, gak ambil history, lebih kecil & cepet
        // pakai execFile (bukan shell string) biar input gak bisa di pakai buat command injection
        await execFilePromise('git', ['clone', '--depth', '1', cloneUrl, cloneDir])

        // hapus folder .git nya, kita cuma butuh source code nya aja, bukan history git
        await rm(path.join(cloneDir, '.git'), { recursive: true, force: true })

        // kompres jadi zip, -9 itu compression level max biar ukuran lebih kecil
        await execFilePromise('zip', ['-9', '-r', zipPath, repo], { cwd: path.dirname(cloneDir) })

        await sock.sendMessage(jid, {
            document: { url: zipPath },
            fileName: `${repo}.zip`,
            mimetype: 'application/zip',
            caption: `✅ berhasil clone *${owner}/${repo}*\nrepo di compress jadi zip biar size nya kecil.`
        }, { quoted: m })

    } catch (e) {
        const reason = e?.stderr || e?.message || 'unknown error'
        await m.arashirep(`❌ gagal clone repo, kemungkinan repo nya gak ada / private / nama nya salah.\n\n\`\`\`${String(reason).slice(0, 500)}\`\`\``)
    } finally {
        // bersihin folder temp nya, jangan numpuk di disk
        await rm(path.dirname(cloneDir), { recursive: true, force: true }).catch(() => {})
        await rm(zipPath, { force: true }).catch(() => {})
    }
}

/**
 * handler buat "git search <keyword>"
 * @param {PluginCtx} ctx
 * @param {string} keyword
 */
async function handleSearch(ctx, keyword) {
    const { m } = ctx

    if (!keyword) return await m.arashirep(`masukkan keyword nya kak, contoh:\n\`git search whatsapp bot\``)

    try {
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(keyword)}&sort=stars&order=desc&per_page=10`
        const res = await fetch(url, {
            headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'mina-miw-bot' }
        })

        if (res.status === 403) {
            return await m.arashirep(`❌ kena rate limit dari github api (tanpa token cuma boleh dikit request per jam), coba lagi nanti ya`)
        }

        if (!res.ok) {
            return await m.arashirep(`❌ gagal search, status: ${res.status}`)
        }

        const json = await res.json()
        const items = json?.items || []

        if (items.length === 0) return await m.arashirep(`gak ketemu repo dengan keyword *${keyword}*`)

        const lines = items.map((repo, i) => {
            const desc = repo.description ? repo.description.slice(0, 100) : '(gak ada deskripsi)'
            return `${i + 1}. *${repo.full_name}*\n` +
                `⭐ ${repo.stargazers_count} • 🍴 ${repo.forks_count} • ${repo.language || '-'}\n` +
                `${desc}\n` +
                `${repo.html_url}`
        })

        const header = `🔎 hasil pencarian *${keyword}*\n\n`
        const footer = `\n\ntips: pakai \`git clone owner/repo\` buat clone salah satu nya`
        await m.arashirep(header + lines.join('\n\n') + footer)

    } catch (e) {
        await m.arashirep(`❌ error: ${e.message}`)
    }
}

/**@param {PluginCtx} ctx */
async function run(ctx) {
    const { text, m } = ctx

    if (!text) return await m.arashirep(
        `welcome git plugin, berikut cara pakai nya:\n\n` +
        `\`git clone <owner/repo>\` atau \`git clone <url>\`\n` +
        `buat clone repo github, hasilnya di kirim sebagai zip\n\n` +
        `\`git search <keyword>\`\n` +
        `buat cari repo di github`
    )

    const param = text.trim().split(/\s+/)
    const subCommand = param[0]?.toLowerCase()
    const rest = text.slice(subCommand.length).trim()

    if (subCommand === 'clone') {
        await handleClone(ctx, rest)
    } else if (subCommand === 'search') {
        await handleSearch(ctx, rest)
    } else {
        await m.arashirep(`subcommand gak dikenali. gunakan *clone* atau *search*`)
    }
}

const description = `adalah plugin buat interaksi sama github\n\n` +
    `\`git clone <owner/repo>\` atau \`git clone <url github lengkap>\`\n` +
    `buat clone repo github (shallow clone, tanpa history), terus di compress jadi zip dan dikirim.\n` +
    `contoh: \`git clone wolfyFlutter/angelina-bot\`\n` +
    `atau: \`git clone https://github.com/wolfyFlutter/angelina-bot\`\n\n` +
    `\`git search <keyword>\`\n` +
    `buat cari repo di github berdasarkan keyword, di sort dari yang paling banyak star.`

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "github tools",
    commands: ["git"],
    categories: ["tools"],
    description
}

plugin.meta = {
    filename: "git.js",
    author: config.devName,
    note: "clone pakai shallow clone biar cepet & kecil, search pakai github rest api publik (rate limited kalau gak pakai token)",
    version: "1",
    path: "tools"
}

export default plugin
