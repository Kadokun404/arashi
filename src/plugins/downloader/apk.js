/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

const BASE_URL = 'https://collectors-several-singing-newspapers.trycloudflare.com'

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    const input = (q?.text || text)?.trim()

    if (!input) {
        return await m.arashirep(
            'format: !apk <package> [arch] [-f]\n' +
            'contoh: !apk com.whatsapp\n' +
            '        !apk com.whatsapp arm64\n' +
            '        !apk com.whatsapp -f (kirim per file)\n' +
            'arch default: arm64'
        )
    }

    const isPerFile = input.includes('-f')
    const cleaned = input.replace('-f', '').trim()
    const [pkg, arch = 'arm64'] = cleaned.split(/\s+/)

    await m.arashirep(`mencari ${pkg}...`)

    try {
        // step 1: trigger download
        const dlRes = await fetch(`${BASE_URL}/api/download/${pkg}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ arch })
        })

        const dlJson = await dlRes.json()
        if (!dlJson.success) return await m.arashirep('❌ gagal mengambil data, package tidak ditemukan')

        if (isPerFile) {
            // step 2: get list file lalu kirim per file
            const filesRes = await fetch(`${BASE_URL}/api/download/${pkg}/files`)
            const filesJson = await filesRes.json()

            if (!filesJson.files?.length) return await m.arashirep('❌ gagal mengambil list file')

            const { files } = filesJson

            const list = files.map((f, i) =>
                `${i + 1}. ${f.name}\n    size: ${(f.size / 1024 / 1024).toFixed(2)} MB`
            ).join('\n\n')

            await m.arashirep(`📦 *${pkg}*\n\n${list}\n\ntotal: ${files.length} file`)

            for (const file of files) {
                await sock.sendMessage(jid, {
                    document: { url: `${BASE_URL}${file.url}` },
                    fileName: file.name,
                    mimetype: 'application/vnd.android.package-archive'
                }, { quoted: m.raw })
            }
        } else {
            // default: kirim zip
            await m.arashirep(`📦 mengunduh ${pkg} sebagai zip...`)

            await sock.sendMessage(jid, {
                document: { url: `${BASE_URL}/api/download/${pkg}/zip` },
                fileName: `${pkg}.zip`,
                mimetype: 'application/zip'
            }, { quoted: m.raw })
        }

    } catch (err) {
        console.error(err)
        return await m.arashirep(`❌ error: ${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "apk downloader",
    commands: ["apk", "getapk"],
    categories: ["downloader"],
    description: "download apk dari google play, contoh: !apk com.whatsapp | tambah -f untuk kirim per file"
}

plugin.meta = {
    filename: "apk.js",
    author: "Kado",
    note: "",
    version: "4",
    path: "downloader"
}

export default plugin