/**
 * @import {PluginCtx, PluginType} from "../types/types.js"
 */

import zlib from 'node:zlib'
import tar from 'tar-stream'

const REGISTRY = 'https://registry.npmjs.org'

function formatBytes(bytes) {
    if (!bytes) return '0 B'
    return (bytes / 1024).toFixed(1) + ' KB'
}

async function npmSearch(query) {
    const res = await fetch(`${REGISTRY}/-/v1/search?text=${encodeURIComponent(query)}&size=10`)
    const json = await res.json()
    return json.objects || []
}

async function npmInfo(pkgName) {
    const res = await fetch(`${REGISTRY}/${encodeURIComponent(pkgName)}`)
    if (!res.ok) throw new Error('paket tidak ditemukan')
    return await res.json()
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text } = ctx

    const args = text?.trim().split(' ') || []
    const sub = args[0]?.toLowerCase()
    const pkgName = args.slice(1).join(' ').trim()

    if (!sub) {
        return await m.arashirep(
            'npm <subcommand> <package>\n\n' +
            'subcommand:\n' +
            '- search <query>\n' +
            '- info <package>\n' +
            '- list <package> (versi)\n' +
            '- files <package> (isi file)\n' +
            '- download <package>\n' +
            '- getfile <package> <path> [-t]\n\n' +
            'contoh:\n' +
            'npm search chalk\n' +
            'npm getfile chalk package.json -t'
        )
    }

    try {
        switch (sub) {
            case 'search': {
                if (!pkgName) return await m.arashirep('masukkan kata kunci pencarian')
                await m.arashirep(`mencari: ${pkgName}...`)

                const results = await npmSearch(pkgName)
                if (!results.length) return await m.arashirep('tidak ada hasil')

                const print = results.map((r, i) =>
                    `${i + 1}. ${r.package.name}@${r.package.version}\n   ${r.package.description || '(no description)'}`
                ).join('\n\n')

                return await m.arashirep(print)
            }

            case 'info': {
                if (!pkgName) return await m.arashirep('masukkan nama package')
                await m.arashirep(`mengambil info: ${pkgName}...`)

                const data = await npmInfo(pkgName)
                const latest = data['dist-tags']?.latest
                const latestData = data.versions?.[latest]

                const print = {
                    name: data.name,
                    version: latest,
                    description: data.description,
                    author: typeof data.author === 'object' ? data.author?.name : data.author,
                    license: data.license,
                    homepage: data.homepage,
                    repository: data.repository?.url,
                    dependencies: latestData?.dependencies ? Object.keys(latestData.dependencies).length : 0,
                    lastPublish: data.time?.[latest]
                }

                return await m.arashirep(`\`\`\`json\n${JSON.stringify(print, null, 2)}\n\`\`\``)
            }

            case 'list': {
                if (!pkgName) return await m.arashirep('masukkan nama package')
                await m.arashirep(`mengambil versi: ${pkgName}...`)

                const data = await npmInfo(pkgName)
                const versions = Object.keys(data.versions || {}).slice(-15)

                const print = `versi terbaru ${pkgName}:\n` + versions.join('\n')
                return await m.arashirep(print)
            }

            case 'files': {
                if (!pkgName) return await m.arashirep('masukkan nama package')
                await m.arashirep(`mengambil daftar file: ${pkgName}...`)

                const data = await npmInfo(pkgName)
                const latest = data['dist-tags']?.latest
                const tarballUrl = data.versions?.[latest]?.dist?.tarball

                if (!tarballUrl) return await m.arashirep('❌ tarball tidak ditemukan')

                const tarRes = await fetch(tarballUrl)
                const buffer = Buffer.from(await tarRes.arrayBuffer())
                const gunzipped = zlib.gunzipSync(buffer)

                const extract = tar.extract()
                const files = []

                await new Promise((resolve, reject) => {
                    extract.on('entry', (header, stream, next) => {
                        files.push(`${header.type === 'directory' ? '[D]' : '[F]'} ${header.name}${header.size ? ` (${(header.size / 1024).toFixed(1)} KB)` : ''}`)
                        stream.on('end', next)
                        stream.resume()
                    })
                    extract.on('finish', resolve)
                    extract.on('error', reject)
                    extract.end(gunzipped)
                })

                let print = `daftar file ${pkgName}@${latest}:\n\n` + files.slice(0, 50).join('\n')
                if (files.length > 50) print += `\n\n... dan ${files.length - 50} file lainnya`

                return await m.arashirep(print)
            }

            case 'download': {
                if (!pkgName) return await m.arashirep('masukkan nama package')
                await m.arashirep(`mengambil tarball: ${pkgName}...`)

                const data = await npmInfo(pkgName)
                const latest = data['dist-tags']?.latest
                const tarballUrl = data.versions?.[latest]?.dist?.tarball
                const size = data.versions?.[latest]?.dist?.unpackedSize

                if (!tarballUrl) return await m.arashirep('❌ tarball tidak ditemukan')

                const tarRes = await fetch(tarballUrl)
                const buffer = Buffer.from(await tarRes.arrayBuffer())

                return await sock.sendMessage(jid, {
                    document: buffer,
                    mimetype: 'application/gzip',
                    fileName: `${pkgName}-${latest}.tgz`,
                    caption: `${pkgName}@${latest}\nsize: ${formatBytes(size)}`
                }, { quoted: m.raw })
            }

            case 'getfile': {
                const isText = args.includes('-t')
                const cleanArgs = args.slice(1).filter(a => a !== '-t')
                const targetPkg = cleanArgs[0]
                const filePath = cleanArgs.slice(1).join(' ')

                if (!targetPkg || !filePath) return await m.arashirep('format: npm getfile <package> <path/file.ext> [-t]')

                await m.arashirep(`mencari file: ${filePath} di ${targetPkg}...`)

                const data = await npmInfo(targetPkg)
                const latest = data['dist-tags']?.latest
                const tarballUrl = data.versions?.[latest]?.dist?.tarball

                if (!tarballUrl) return await m.arashirep('❌ tarball tidak ditemukan')

                const tarRes = await fetch(tarballUrl)
                const buffer = Buffer.from(await tarRes.arrayBuffer())
                const gunzipped = zlib.gunzipSync(buffer)

                const extract = tar.extract()
                let foundBuffer = null
                let foundName = null

                const normalizedTarget = `package/${filePath.replace(/^\.?\//, '')}`

                await new Promise((resolve, reject) => {
                    extract.on('entry', (header, stream, next) => {
                        const chunks = []
                        stream.on('data', c => chunks.push(c))
                        stream.on('end', () => {
                            if (header.name === normalizedTarget) {
                                foundBuffer = Buffer.concat(chunks)
                                foundName = header.name.replace(/^package\//, '')
                            }
                            next()
                        })
                        stream.resume()
                    })
                    extract.on('finish', resolve)
                    extract.on('error', reject)
                    extract.end(gunzipped)
                })

                if (!foundBuffer) return await m.arashirep(`❌ file "${filePath}" tidak ditemukan di package ${targetPkg}`)

                if (isText) {
                    let content = foundBuffer.toString('utf-8')
                    if (content.length > 3000) content = content.slice(0, 3000) + '\n\n[terpotong...]'
                    return await m.arashirep(`\`\`\`${content}\`\`\``)
                }

                return await sock.sendMessage(jid, {
                    document: foundBuffer,
                    fileName: foundName.split('/').pop(),
                    mimetype: 'application/octet-stream'
                }, { quoted: m.raw })
            }

            default:
                return await m.arashirep(`subcommand "${sub}" tidak dikenal\ngunakan: search, info, list, files, download, getfile`)
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
    name: "npm",
    commands: ["npm"],
    categories: ["tools"],
    description: "akses npm registry: search, info, list, files, download, getfile"
}

plugin.meta = {
    filename: "npm.js",
    version: "3",
    author: "Kado",
    note: "gabut",
path: "tools"
}

export default plugin