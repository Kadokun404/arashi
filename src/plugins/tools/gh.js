/**
 * @import {PluginCtx, PluginType} from "../types/types.js"
 */

import { config } from "#root/config.js"

const API = 'https://api.github.com'

function formatBytes(bytes) {
    if (!bytes) return '0 B'
    if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    return (bytes / 1024).toFixed(1) + ' KB'
}

async function ghFetch(path) {
    const res = await fetch(`${API}${path}`, {
        headers: {
            'User-Agent': 'Mina-Miw-Bot',
            ...(config.GITHUB_TOKEN && { Authorization: `Bearer ${config.GITHUB_TOKEN}` })
        }
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text } = ctx

    const args = text?.trim().split(' ') || []
    const sub = args[0]?.toLowerCase()

    if (!sub) {
        return await m.arashirep(
            'gh <subcommand>\n\n' +
            'subcommand:\n' +
            '- search <query>\n' +
            '- info <owner/repo>\n' +
            '- user <username>\n' +
            '- files <owner/repo> [path]\n' +
            '- getfile <owner/repo> <path> [-t]\n' +
            '- download <owner/repo> (zip branch default)\n\n' +
            'contoh:\n' +
            'gh info whiskeysockets/baileys\n' +
            'gh getfile whiskeysockets/baileys package.json -t'
        )
    }

    try {
        switch (sub) {
            case 'search': {
                const query = args.slice(1).join(' ')
                if (!query) return await m.arashirep('masukkan kata kunci pencarian')
                await m.arashirep(`mencari: ${query}...`)

                const data = await ghFetch(`/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`)
                if (!data.items?.length) return await m.arashirep('tidak ada hasil')

                const print = data.items.map((r, i) =>
                    `${i + 1}. ${r.full_name} ⭐${r.stargazers_count}\n   ${r.description || '(no description)'}`
                ).join('\n\n')

                return await m.arashirep(print)
            }

            case 'info': {
                const repo = args[1]
                if (!repo) return await m.arashirep('format: gh info <owner/repo>')
                await m.arashirep(`mengambil info: ${repo}...`)

                const data = await ghFetch(`/repos/${repo}`)

                const print = {
                    name: data.full_name,
                    description: data.description,
                    stars: data.stargazers_count,
                    forks: data.forks_count,
                    issues: data.open_issues_count,
                    language: data.language,
                    license: data.license?.name || '-',
                    defaultBranch: data.default_branch,
                    createdAt: data.created_at,
                    updatedAt: data.updated_at,
                    url: data.html_url
                }

                return await m.arashirep(`\`\`\`json\n${JSON.stringify(print, null, 2)}\n\`\`\``)
            }

            case 'user': {
                const username = args[1]
                if (!username) return await m.arashirep('format: gh user <username>')
                await m.arashirep(`mengambil info: ${username}...`)

                const data = await ghFetch(`/users/${username}`)

                const print = {
                    username: data.login,
                    name: data.name,
                    bio: data.bio,
                    followers: data.followers,
                    following: data.following,
                    publicRepos: data.public_repos,
                    company: data.company,
                    location: data.location,
                    blog: data.blog,
                    url: data.html_url
                }

                return await m.arashirep(`\`\`\`json\n${JSON.stringify(print, null, 2)}\n\`\`\``)
            }

            case 'files': {
                const repo = args[1]
                const path = args.slice(2).join(' ') || ''
                if (!repo) return await m.arashirep('format: gh files <owner/repo> [path]')
                await m.arashirep(`mengambil daftar file: ${repo}/${path}...`)

                const data = await ghFetch(`/repos/${repo}/contents/${path}`)

                if (!Array.isArray(data)) return await m.arashirep('❌ path tersebut adalah file, bukan folder')

                const print = data.map(f =>
                    `${f.type === 'dir' ? '[D]' : '[F]'} ${f.name}${f.size ? ` (${formatBytes(f.size)})` : ''}`
                ).join('\n')

                return await m.arashirep(`isi ${repo}/${path || '.'}:\n\n${print}`)
            }

            case 'getfile': {
                const isText = args.includes('-t')
                const cleanArgs = args.slice(1).filter(a => a !== '-t')
                const repo = cleanArgs[0]
                const filePath = cleanArgs.slice(1).join(' ')

                if (!repo || !filePath) return await m.arashirep('format: gh getfile <owner/repo> <path> [-t]')

                await m.arashirep(`mengambil file: ${filePath} di ${repo}...`)

                const data = await ghFetch(`/repos/${repo}/contents/${filePath}`)

                if (Array.isArray(data)) return await m.arashirep('❌ path tersebut adalah folder, bukan file')
                if (!data.download_url) return await m.arashirep('❌ file tidak ditemukan')

                const fileRes = await fetch(data.download_url)
                const buffer = Buffer.from(await fileRes.arrayBuffer())

                if (isText) {
                    let content = buffer.toString('utf-8')
                    if (content.length > 3000) content = content.slice(0, 3000) + '\n\n[terpotong...]'
                    return await m.arashirep(`\`\`\`${content}\`\`\``)
                }

                return await sock.sendMessage(jid, {
                    document: buffer,
                    fileName: data.name,
                    mimetype: 'application/octet-stream'
                }, { quoted: m.raw })
            }

            case 'download': {
                const repo = args[1]
                if (!repo) return await m.arashirep('format: gh download <owner/repo>')
                await m.arashirep(`mengambil repo: ${repo}...`)

                const repoInfo = await ghFetch(`/repos/${repo}`)
                const branch = repoInfo.default_branch

                const zipUrl = `https://github.com/${repo}/archive/refs/heads/${branch}.zip`
                const zipRes = await fetch(zipUrl)

                if (!zipRes.ok) return await m.arashirep('❌ gagal mengambil zip repo')

                const buffer = Buffer.from(await zipRes.arrayBuffer())

                return await sock.sendMessage(jid, {
                    document: buffer,
                    mimetype: 'application/zip',
                    fileName: `${repo.replace('/', '-')}-${branch}.zip`,
                    caption: `${repo}@${branch}\nsize: ${formatBytes(buffer.length)}`
                }, { quoted: m.raw })
            }

            default:
                return await m.arashirep(`subcommand "${sub}" tidak dikenal\ngunakan: search, info, user, files, getfile, download`)
        }
    } catch (e) {
        await m.arashirep(`❌ ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "github",
    commands: ["gh", "github"],
    categories: ["tools"],
    description: "akses github: search, info, user, files, getfile, download"
}

plugin.meta = {
    filename: "gh.js",
    version: "2",
    author: "Kado",
    note: "gabut",
path: "tools"
}

export default plugin