/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import fs from 'node:fs'
import path from 'node:path'
import { allPaths } from '../../all-paths.js'
import { config } from '#root/config.js'

const actions = ['get', 'list', 'install']


const BLOCKED_SEGMENTS = ['auth', 'node_modules', '.git', '.env', 'data']

/**
 * resolve targetPath user jadi absolute path, sekaligus mastiin
 * hasilnya tetep di dalam root project (anti path traversal pakai ../../dst)
 * dan gak nyentuh folder/file yang di blok
 * @param {string} targetPath path relative yang di ketik user
 * @returns {{ ok: true, absolutePath: string } | { ok: false, message: string }}
 */
function resolveSafePath(targetPath) {
    const root = allPaths.root
    const absolutePath = path.resolve(root, targetPath)

    
    const relative = path.relative(root, absolutePath)
    const isOutsideRoot = relative.startsWith('..') || path.isAbsolute(relative)
    if (isOutsideRoot) {
        return { ok: false, message: `❌ gak boleh keluar dari root project ya` }
    }

    
    const segments = relative.split(path.sep)
    const hitBlocked = segments.some(seg => BLOCKED_SEGMENTS.includes(seg))
    if (hitBlocked) {
        return { ok: false, message: `❌ path ini di lindungi, gak bisa di akses lewat plugin ini\n(blocked: ${BLOCKED_SEGMENTS.join(', ')})` }
    }

    return { ok: true, absolutePath }
}

/**
 * parsing param dari text, misal "get -t config.js" atau "install -r plugins/owner/test.js"
 * @param {string} text
 * @returns {{ userAction: string|undefined, isReplace: boolean, isText: boolean, targetPath: string|undefined }}
 */
function parseParam(text) {
    const param = (text || '').trim().split(/\s+/).filter(Boolean)
    const userAction = param[0]

    let isReplace = false
    let isText = false

    const pathParams = param.slice(1).filter(p => {
        if (p === '-r') {
            isReplace = true
            return false
        }
        if (p === '-t') {
            isText = true
            return false
        }
        return true
    })

    const targetPath = pathParams.join(' ') || undefined

    return { userAction, isReplace, isText, targetPath }
}

/**
 * handler buat "file get <path> [-t]"
 * @param {PluginCtx} ctx
 * @param {{ targetPath: string|undefined, isText: boolean }} params
 */
async function handleGet(ctx, params) {
    const { sock, jid, m, q } = ctx
    const { targetPath, isText } = params

    if (!targetPath) return await m.arashirep(`masukkan path file nya, contoh:\nfile get config.js`)

    const resolved = resolveSafePath(targetPath)
    if (!resolved.ok) return await m.arashirep(resolved.message)

    const { absolutePath } = resolved

    if (!fs.existsSync(absolutePath)) return await m.arashirep(`❌ file gak ketemu: ${targetPath}`)

    const stat = fs.statSync(absolutePath)
    if (stat.isDirectory()) return await m.arashirep(`❌ itu folder, bukan file. pakai *file list ${targetPath}* buat liat isinya`)

    const fileName = path.basename(absolutePath)

    // kirim sebagai text, gak ada batasan ukuran soalnya cuma di kirim sebagai pesan text
    if (isText) {
        const content = await fs.promises.readFile(absolutePath, { encoding: 'utf-8' })
        return await sock.sendMessage(jid, { text: content }, { quoted: q || m })
    }

    // kirim sebagai dokumen
    return await sock.sendMessage(jid, {
        document: { url: absolutePath },
        fileName,
        mimetype: 'application/octet-stream'
    }, { quoted: q || m })
}

/**
 * handler buat "file list [path]"
 * @param {PluginCtx} ctx
 * @param {{ targetPath: string|undefined }} params
 */
async function handleList(ctx, params) {
    const { m } = ctx
    const { targetPath } = params

    // kalau gak di isi targetPath, default ke root project
    const resolved = resolveSafePath(targetPath || '.')
    if (!resolved.ok) return await m.arashirep(resolved.message)

    const { absolutePath } = resolved

    if (!fs.existsSync(absolutePath)) return await m.arashirep(`❌ path gak ketemu: ${targetPath || '.'}`)

    const stat = fs.statSync(absolutePath)

    // kalau yang di minta file, ya tinggal kasih info file nya aja
    if (stat.isFile()) {
        const sizeKb = (stat.size / 1024).toFixed(2)
        return await m.arashirep(`📄 *${path.basename(absolutePath)}*\nukuran: ${sizeKb} KB`)
    }

    // listing rekursif, semua subfolder & file, apapun ekstensi nya
    const entries = await fs.promises.readdir(absolutePath, { recursive: true, withFileTypes: true })

    // filter biar segment yang di blok gak ikut muncul di list
    const visibleEntries = entries.filter(entry => {
        const entryRelativePath = path.join(entry.parentPath ? path.relative(absolutePath, entry.parentPath) : '', entry.name)
        const segments = entryRelativePath.split(path.sep)
        return !segments.some(seg => BLOCKED_SEGMENTS.includes(seg))
    })

    if (visibleEntries.length === 0) return await m.arashirep(`folder nya kosong: ${targetPath || '.'}`)

    const lines = visibleEntries
        .map(entry => {
            const entryRelativePath = path.join(entry.parentPath ? path.relative(absolutePath, entry.parentPath) : '', entry.name)
            const icon = entry.isDirectory() ? '📁' : '📄'
            return `${icon} ${entryRelativePath}`
        })
        .sort()

    const baseLabel = targetPath || '. (root)'
    const header = `*📂 isi dari: ${baseLabel}*\ntotal: ${lines.length} item\n\n`

    let body = lines.join('\n')


    const MAX_LENGTH = 4000
    if (body.length > MAX_LENGTH) {
        body = body.slice(0, MAX_LENGTH) + `\n\n[...terpotong, total ${lines.length} item, coba list folder yang lebih spesifik]`
    }

    return await m.arashirep(header + body)
}

/**
 * handler buat "file install <path> [-r]", wajib reply ke dokumen atau teks
 * @param {PluginCtx} ctx
 * @param {{ targetPath: string|undefined, isReplace: boolean }} params
 */
async function handleInstall(ctx, params) {
    const { m, q } = ctx
    const { targetPath, isReplace } = params

    if (!targetPath) return await m.arashirep(`masukkan path tujuan nya, contoh:\nfile install plugins/owner/test.js\n\n(reply ke dokumen atau pesan teks yang berisi konten file nya)`)

    if (!q) return await m.arashirep(`reply ke pesan dokumen atau pesan teks yang berisi konten file nya`)

    const resolved = resolveSafePath(targetPath)
    if (!resolved.ok) return await m.arashirep(resolved.message)

    const { absolutePath } = resolved

    const fileExists = fs.existsSync(absolutePath)
    if (fileExists && !isReplace) {
        return await m.arashirep(`❌ file udah ada di *${targetPath}*\nkalau mau replace, tambahin param *-r*\ncontoh: file install ${targetPath} -r`)
    }

    
    const parentDir = path.dirname(absolutePath)
    await fs.promises.mkdir(parentDir, { recursive: true })

    if (q.content === 'documentMessage') {
        const buffer = await q.download('buffer')
        await fs.promises.writeFile(absolutePath, buffer)
    } else if (q.content === 'conversation') {
        await fs.promises.writeFile(absolutePath, q.text, { encoding: 'utf-8' })
    } else {
        return await m.arashirep(`reply yang bener kocak, harus dokumen atau pesan teks`)
    }

    const actionWord = fileExists ? 'di replace' : 'di install'
    return await m.arashirep(`✅ file *${targetPath}* berhasil ${actionWord}`)
}

/**@param {PluginCtx} ctx */
async function run(ctx) {
    const { text, m, prefix, command } = ctx

    const pc = `${prefix || ''}${command}`

    if (!text) {
        const print =
            `*📁 file manager*\n\n` +
            `actions: ${actions.join(', ')}\n\n` +
            `\`${pc} get <path> [-t]\`\nambil file nya, kirim sebagai dokumen. pakai *-t* buat kirim sebagai teks, gak ada batasan ukuran.\n\n` +
            `\`${pc} list [path]\`\nlist semua file & folder secara rekursif. kalau path gak di isi, default nya dari root project.\n\n` +
            `\`${pc} install <path> [-r]\`\nreply ke dokumen / teks buat install/taro file ke path itu. pakai *-r* buat replace kalau udah ada file nya.\n\n` +
            `contoh: ${pc} get config.js`
        return await m.arashirep(print)
    }

    const { userAction, isReplace, isText, targetPath } = parseParam(text)

    if (!actions.includes(userAction)) {
        return await m.arashirep(`action gak dikenali, pilih salah satu: ${actions.join(', ')}`)
    }

    if (userAction === 'get') return await handleGet(ctx, { targetPath, isText })
    if (userAction === 'list') return await handleList(ctx, { targetPath })
    if (userAction === 'install') return await handleInstall(ctx, { targetPath, isReplace })
}

const description = `adalah plugin buat manage semua file yang ada di root project\n\n` +
    `\`file get <path> [-t]\`\n` +
    `ambil file dari mana aja di dalem root project, kirim sebagai dokumen. tambahin *-t* buat kirim sebagai teks (gak ada batasan ukuran).\n\n` +
    `\`file list [path]\`\n` +
    `list semua file & folder secara rekursif, kalau path gak di isi defaultnya dari root project.\n\n` +
    `\`file install <path> [-r]\`\n` +
    `wajib reply ke dokumen / pesan teks, isinya bakal di taro ke path tujuan. *-r* buat replace kalau file nya udah ada.\n\n` +
    `catatan: folder/file sensitif (${BLOCKED_SEGMENTS.join(', ')}) di lindungi dan gak bisa di akses sama sekali lewat plugin ini, termasuk pas pakai *-r*.`

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "file manager",
    commands: ["file"],
    categories: ["main"],
    description
}

plugin.meta = {
    filename: "file-manager.js",
    author: config.devName,
    note: "akses semua file di root project, tapi tetep ada folder yang di lindungi (auth, node_modules, dst)",
    version: "1",
    path: "main"
}

plugin.config = {
    protected: true
}

export default plugin