/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

const MIME_MAP = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg', 'ico', 'heic', 'heif'],
    video: ['mp4', 'mkv', 'mov', 'avi', 'webm', '3gp', 'flv', 'wmv', 'm4v', 'mpeg', 'mpg'],
    audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus', 'wma', 'amr'],
    text: [
        'txt', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'html', 'htm', 'css', 'scss', 'less',
        'xml', 'csv', 'tsv', 'md', 'markdown', 'log', 'yml', 'yaml', 'ini', 'env', 'sql',
        'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'bash', 'bat', 'ps1',
        'vue', 'svelte', 'conf', 'toml', 'properties', 'gradle'
    ]
}


function getMediaType(fileName = '', mimetype = '') {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''

    if (MIME_MAP.image.includes(ext) || mimetype.startsWith('image/')) return 'image'
    if (MIME_MAP.video.includes(ext) || mimetype.startsWith('video/')) return 'video'
    if (MIME_MAP.audio.includes(ext) || mimetype.startsWith('audio/')) return 'audio'
    if (
        MIME_MAP.text.includes(ext) ||
        mimetype.startsWith('text/') ||
        ['application/json', 'application/javascript', 'application/xml', 'application/x-yaml'].includes(mimetype)
    ) return 'text'

    // fallback: tipe apapun yang nggak masuk kategori di atas (pdf, zip, apk, doc, dll)
    return 'document'
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q } = ctx

    if (!q) return await m.arashirep('reply dokumen yang mau dibuka kak')

    if (q.content !== 'documentMessage') return await m.arashirep('reply dokumen untuk menggunakan perintah ini')

    const docMsg = q.message.documentMessage
    const fileName = docMsg.fileName || 'file'
    const mimetype = docMsg.mimetype || 'application/octet-stream'
    const mediaType = getMediaType(fileName, mimetype)

    const buffer = await q.download('buffer')

    // file teks/kode -> tampilkan isinya langsung sebagai pesan
    if (mediaType === 'text') {
        let content = buffer.toString('utf-8')

        const text = '```' + content + '```'
        return await m.arashirep(text)
    }

    // tipe lain yang nggak dikenal -> kirim ulang sebagai dokumen biasa
    if (mediaType === 'document') {
        return await sock.sendMessage(jid, {
            document: buffer,
            fileName,
            mimetype
        }, { quoted: m.raw })
    }

    // image / video / audio -> kirim sesuai jenis medianya
    const payload = { [mediaType]: buffer }
    if (mediaType === 'audio') payload.mimetype = mimetype || 'audio/mpeg'

    await sock.sendMessage(jid, payload, { quoted: m.raw })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "buka dokumen",
    commands: ["cat", "buka"],
    categories: ["tools"],
    description: "buka dokumen jadi media sesuai tipenya, atau tampilkan isinya kalau berupa teks/kode"
}

plugin.meta = {
    filename: "cat.js",
    version: "2",
    author: "Kado",
    note: "support semua mime type",
path: "tools"
}

export default plugin