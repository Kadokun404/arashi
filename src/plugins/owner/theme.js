import { getFirstStringAndRest } from "#helper/common.js"
import { Readable } from "node:stream"
import { InteractiveMessage } from "#helper/interactive-message.js"
import { execFile } from "node:child_process"
import nodeFs from "node:fs/promises"
import nodeOs from "node:os"
import nodePath from "node:path"
import { prepareWAMessageMedia, getHttpStream, proto, normalizeMessageContent, getContentType } from "baileys"
import { config } from "#root/config.js"

const KNOWN_SUBCOMMANDS = ["set", "get", "clear", "view", "export", "use", "flaticon"]
const KNOWN_FIELDS = ["title", "name", "description", "desc", "url", "thumbnail", "thumb", "favicon", "icon", "fav"]

const checkUrl = (url) => {
    try {
        return new URL(url)?.toString()
    } catch {
        return undefined
    }
}

const sanitizeFileName = s => s?.replaceAll(/[-.\/\\]+/g, '')?.match(/\S+/g)?.join('-')

function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
    for (let i = 0; i <= a.length; i++) dp[i][0] = i
    for (let j = 0; j <= b.length; j++) dp[0][j] = j
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
        }
    }
    return dp[a.length][b.length]
}

function findClosest(input, candidates, maxDistance = 2) {
    if (!input) return undefined
    let best, bestDist = Infinity
    for (const c of candidates) {
        const d = levenshtein(input, c)
        if (d < bestDist) {
            bestDist = d
            best = c
        }
    }
    return bestDist <= maxDistance ? best : undefined
}

const HELP_TEXT = `haloo sayangg, ini menu buat atur tema/preview bot kita:\n\n` +
    `set\nget\nclear\nview\nexport\nuse\n\n` +
    `contoh: theme set title Mina Haileii.`

const FIELD_HINT_TEXT = `field yang bisa kamu atur, byy:\n` +
    `title [ name ]\n` +
    `desc [ description ]\n` +
    `url\n` +
    `thumb [ thumbnail, bisa reply gambar/link preview, atau kirim gambar + caption ]\n` +
    `favicon [ icon, fav, caranya sama kayak thumb, tanpa argumen = hapus favicon ]\n\n` +
    `contoh: theme set title Catesya`
const BROWSER_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"

const looksLikeImage = (b) =>
    b.length > 12 && (
        (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) ||
        (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) ||
        b.subarray(0, 4).toString() === "GIF8" ||
        (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP")
    )

/**
 * download gambar dari link. coba fetch dulu (header browser), kalau ditolak
 * (misal 403) fallback download pakai curl ke /tmp, dibaca, lalu file nya dihapus
 * @param {string} url
 * @returns {Promise<{buffer?: Buffer, error?: string}>}
 */
async function downloadImage(url) {
    const origin = new URL(url).origin + "/"
    let lastStatus = 0

    try {
        const res = await fetch(url, {
            headers: { "user-agent": BROWSER_UA, referer: origin, accept: "image/*,*/*;q=0.8" },
            redirect: "follow",
            signal: AbortSignal.timeout(30000)
        })
        lastStatus = res.status
        if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer())
            if (!looksLikeImage(buffer)) return { error: `link bukan gambar langsung (${res.headers.get("content-type") || "tipe tidak diketahui"})` }
            return { buffer }
        }
    } catch { }

    const tmp = nodePath.join(nodeOs.tmpdir(), `theme-${Date.now()}.img`)
    try {
        const status = await new Promise((resolve, reject) => {
            execFile("curl", [
                "-sL", "--max-time", "30",
                "-A", BROWSER_UA, "-e", origin,
                "-H", "Accept: image/avif,image/webp,image/*,*/*;q=0.8",
                "-o", tmp, "-w", "%{http_code}", url
            ], (err, stdout) => err ? reject(err) : resolve(Number(stdout)))
        })
        if (status !== 200) return { error: `gagal ambil gambar (http ${status || lastStatus})` }
        const buffer = await nodeFs.readFile(tmp)
        if (!looksLikeImage(buffer)) return { error: `link bukan gambar langsung` }
        return { buffer }
    } catch (e) {
        return { error: `gagal ambil gambar (http ${lastStatus || "?"}), curl: ${e.message}` }
    } finally {
        await nodeFs.rm(tmp, { force: true })
    }
}

// link halaman flaticon (flaticon.com/free-icon/nama_ID) -> link gambar langsung di cdn
const FLATICON_RE = /flaticon\.com\/[^?#]*?_(\d{3,})(?:[/?#]|$)/i
const flaticonCdn = (link) => {
    const id = link?.match(FLATICON_RE)?.[1]
    return id ? `https://cdn-icons-png.flaticon.com/512/${Math.floor(Number(id) / 1000)}/${id}.png` : undefined
}

async function handleFlaticon(ctx, input) {
    const { m, q, sock, jid, prefix } = ctx
    const link = input || q?.text
    const cdn = flaticonCdn(link)
    if (!cdn) {
        return await m.arashirep(
            `kirim link halaman flaticon, contoh:\n` +
            `theme flaticon https://www.flaticon.com/free-icon/chick_2632839\n\n` +
            `atau reply pesan yang isinya link flaticon`
        )
    }

    await new InteractiveMessage(sock)
        .setBody(`link icon siap dipakai:\n${cdn}\n\nsalin linknya, lalu kirim:\n${prefix ?? ""}theme set fav <link>`)
        .setFooter("flaticon")
        .addButtonCopy("salin link icon", cdn)
        .sendTo(jid)
}

async function resolveImageMedia(ctx, restString) {
    const { q, m, sock } = ctx
    let stream
    if (q) {
        if (q?.content !== "extendedTextMessage" && q?.content !== "imageMessage") {
            return { error: `message yang di reply gak di dukung, reply gambar atau link preview kak` }
        }
        stream = await q.download()
    } else if (m.content === "imageMessage") {
        stream = await m.download()
    } else {
        if (!restString) return { error: `kasih link gambar, reply gambar, atau kirim gambar bareng command ini kak` }
        const url = checkUrl(flaticonCdn(restString) || restString)
        if (!url) return { error: `url ga valid kak` }
        const dl = await downloadImage(url)
        if (dl.error) return { error: dl.error }
        stream = Readable.from(dl.buffer)
    }

    const { imageMessage } = await prepareWAMessageMedia({
        image: { stream }
    }, {
        upload: sock.waUploadToServer,
        mediaTypeOverride: 'thumbnail-link'
    })

    return { imageMessage }
}

async function handleSet(ctx, field, value) {
    const { m, themeManager } = ctx

    if (field === "title" || field === "name") {
        const r = await themeManager.setTitle(value)
        return await m.arashirep(r.error ? `❌ ${r.error}` : `✅ ${r.data}`)
    }

    if (field === "description" || field === "desc") {
        const r = await themeManager.setDescription(value)
        return await m.arashirep(r.error ? `❌ ${r.error}` : `✅ ${r.data}`)
    }

    if (field === "url") {
        const r = await themeManager.setUrl(value)
        return await m.arashirep(r.error ? `❌ ${r.error}` : `✅ ${r.data}`)
    }

    if (field === "thumbnail" || field === "thumb") {
        const media = await resolveImageMedia(ctx, value)
        if (media.error) return await m.arashirep(`❌ ${media.error}`)
        const i = media.imageMessage
        const existingFavicon = themeManager.getData()?.message?.extendedTextMessage?.faviconMMSMetadata

        const message_obj = {
            extendedTextMessage: {
                "title": "",
                "description": "",
                "text": "",
                "matchedText": "",
                "previewType": "NONE",
                "inviteLinkGroupTypeV2": "DEFAULT",
                "jpegThumbnail": i.jpegThumbnail,
                "thumbnailDirectPath": i.directPath,
                "thumbnailSha256": i.fileSha256,
                "thumbnailEncSha256": i.fileEncSha256,
                "mediaKey": i.mediaKey,
                "mediaKeyTimestamp": i.mediaKeyTimestamp,
                "thumbnailWidth": i.width,
                "thumbnailHeight": i.height,
                ...(existingFavicon ? { faviconMMSMetadata: existingFavicon } : {})
            }
        }

        const wamc = proto.Message.fromObject(message_obj)
        const r = await themeManager.setMessage(wamc)
        if (r.error) return await m.arashirep(`❌ ${r.error}`)
        return await m.react('✅')
    }

    if (field === "favicon" || field === "icon" || field === "fav") {
        const { q } = ctx
        const noArg = !value && !q && m.content !== "imageMessage"
        if (noArg) {
            const r = await themeManager.setFavicon(undefined)
            return await m.arashirep(r.error ? `❌ ${r.error}` : `✅ ${r.data}`)
        }

        const media = await resolveImageMedia(ctx, value)
        if (media.error) return await m.arashirep(`❌ ${media.error}`)
        const i = media.imageMessage

        const faviconMeta = {
            thumbnailDirectPath: i.directPath,
            thumbnailSha256: i.fileSha256,
            thumbnailEncSha256: i.fileEncSha256,
            mediaKey: i.mediaKey,
            mediaKeyTimestamp: i.mediaKeyTimestamp,
            thumbnailHeight: i.height,
            thumbnailWidth: i.width,
        }

        const r = await themeManager.setFavicon(faviconMeta)
        if (r.error) return await m.arashirep(`❌ ${r.error}`)
        return await m.react('✅')
    }

    const suggestion = findClosest(field, KNOWN_FIELDS)
    return await m.arashirep(
        suggestion
            ? `no way, "${field}" this not variable from theme manager, do you mean *${suggestion}*?`
            : `no way, "${field}" this not variable from theme manager\n\n${FIELD_HINT_TEXT}`
    )
}

async function handleGet(ctx, field) {
    const { m, themeManager } = ctx
    const data = themeManager.getData()

    if (field === "title" || field === "name") {
        return await m.arashirep(data?.title ? `title sekarang: ${data.title}` : `title belum di set`)
    }

    if (field === "description" || field === "desc") {
        return await m.arashirep(data?.description ? `description sekarang: ${data.description}` : `description belum di set`)
    }

    if (field === "url") {
        return await m.arashirep(data?.url ? `url sekarang: ${data.url}` : `url belum di set`)
    }

    if (field === "thumbnail" || field === "thumb") {
        const thumb = data?.message?.extendedTextMessage
        if (!thumb?.thumbnailDirectPath) return await m.arashirep(`thumbnail belum di set`)
        return await m.arashirep(`thumbnail sekarang: ${thumb.thumbnailWidth}x${thumb.thumbnailHeight}\n\ncoba *theme view* buat liat previewnya`)
    }

    if (field === "favicon" || field === "icon" || field === "fav") {
        const favicon = data?.message?.extendedTextMessage?.faviconMMSMetadata
        if (!favicon?.thumbnailDirectPath) return await m.arashirep(`favicon belum di set`)
        return await m.arashirep(`favicon sekarang: ${favicon.thumbnailWidth}x${favicon.thumbnailHeight}\n\ncoba *theme view* buat liat previewnya`)
    }

    const suggestion = findClosest(field, KNOWN_FIELDS)
    return await m.arashirep(
        suggestion
            ? `no way, "${field}" this not variable from theme manager, do you mean *${suggestion}*?`
            : `no way, "${field}" this not variable from theme manager\n\n${FIELD_HINT_TEXT}`
    )
}

async function handleClear(ctx, field) {
    const { m, themeManager } = ctx

    if (field === "title" || field === "name") {
        const r = await themeManager.setTitle(undefined)
        return await m.arashirep(r.error ? `❌ ${r.error}` : `✅ title di hapus`)
    }

    if (field === "description" || field === "desc") {
        const r = await themeManager.setDescription(undefined)
        return await m.arashirep(r.error ? `❌ ${r.error}` : `✅ description di hapus`)
    }

    if (field === "favicon" || field === "icon" || field === "fav") {
        const r = await themeManager.setFavicon(undefined)
        return await m.arashirep(r.error ? `❌ ${r.error}` : `✅ favicon di hapus`)
    }

    if (field === "url") {
        return await m.arashirep(`❌ url gak bisa di kosongin gitu aja, ganti aja pake *theme set url <link baru>*`)
    }

    if (field === "thumbnail" || field === "thumb") {
        return await m.arashirep(`❌ thumbnail gak bisa di clear, harus di *ganti*: reply gambar/link preview terus *theme set thumb*`)
    }

    const suggestion = findClosest(field, KNOWN_FIELDS)
    return await m.arashirep(
        suggestion
            ? `no way, "${field}" this not variable from theme manager, do you mean *${suggestion}*?`
            : `no way, "${field}" this not variable from theme manager\n\n${FIELD_HINT_TEXT}`
    )
}

async function handleView(ctx) {
    const { sock, jid, themeManager } = ctx
    const themeConfig = themeManager.getData()

    return await sock.relayMessage(jid, {
        extendedTextMessage: {
            ...themeConfig?.message?.extendedTextMessage,
            "text": (themeConfig?.url ?? '') + "\nini preview menu",
            "matchedText": themeConfig?.url,
            "description": themeConfig?.description,
            "title": themeConfig?.title,
        }
    }, {})
}

async function run(ctx) {
    if (!ctx.isOwner) return
    const { m, text, themeManager, q, sock, jid } = ctx
    if (!text) return await m.arashirep(HELP_TEXT)

    let { firstString, restString } = getFirstStringAndRest(text)

    // dukung urutan terbalik: "theme fav set <link>" sama kayak "theme set fav <link>"
    if (firstString && KNOWN_FIELDS.includes(firstString.toLowerCase()) && restString) {
        const second = getFirstStringAndRest(restString)
        if (["set", "get", "clear"].includes(second.firstString?.toLowerCase())) {
            restString = [firstString, second.restString].filter(Boolean).join(" ")
            firstString = second.firstString
        }
    }

    const subCommand = firstString?.toLowerCase()
    const restText = restString

    if (subCommand === "set" || subCommand === "get" || subCommand === "clear") {
        if (!restText) return await m.arashirep(FIELD_HINT_TEXT)

        const { firstString: fieldRaw, restString: fieldRestString } = getFirstStringAndRest(restText)
        const field = fieldRaw?.toLowerCase()
        const fieldValue = fieldRestString

        if (subCommand === "set") return await handleSet(ctx, field, fieldValue)
        if (subCommand === "clear") return await handleClear(ctx, field)
        return await handleGet(ctx, field)
    }

    if (subCommand === "flaticon") {
        return await handleFlaticon(ctx, restText)
    }

    if (subCommand === "view") {
        return await handleView(ctx)
    }

    if (subCommand === "export") {
        const data = JSON.stringify(themeManager.getData(), null, 2)
        const prefixFileName = sanitizeFileName(restText) ?? `theme`
        const ts = Date.now()

        const fileName = `${prefixFileName}-${ts}.json`
        return await sock.sendMessage(jid, {
            document: Buffer.from(data),
            fileName,
            mimetype: `application/json`,
            caption: `nih tema nya kak 📦`
        })
    }

    if (subCommand === "use") {
        if (!q) return await m.arashirep(`reply ke pesan dokumen json tema dulu kak`)
        const qNormalized = normalizeMessageContent(q?.message)
        const qContent = getContentType(qNormalized)
        if (qContent !== "documentMessage") return await m.arashirep(`❌ musti reply dokumen (file .json)`)
        if (qNormalized?.documentMessage?.mimetype !== "application/json") return await m.arashirep(`❌ mime type file nya bukan json kak`)
        try {
            const buffer = await q.download("buffer")
            const json = JSON.parse(buffer.toString())
            await themeManager.useExternalJson(json)
            return await m.arashirep(`✅ sip tema berhasil di ganti, coba test`)
        } catch (e) {
            return await m.arashirep(`❌ gagal import tema: ${e.message}`)
        }
    }

    const suggestion = findClosest(subCommand, KNOWN_SUBCOMMANDS)
    return await m.arashirep(
        suggestion
            ? `no way, "${subCommand}" this not action from theme manager, do you mean *${suggestion}*?`
            : `no way, "${subCommand}" this not action from theme manager\n\n${HELP_TEXT}`
    )
}

const plugin = {
    run,
    name: "theme",
    commands: ["theme", "update"],
    categories: ["owner"],
    description: "edit tema/preview menu (set/get/clear field, view, export/use)\n\n" + HELP_TEXT
}

plugin.meta = {
    filename: "theme.js",
    author: config.devName,
    note: "clear buat title/desc/favicon, url/thumb harus di ganti",
    version: "9",
    path: "owner"
}

plugin.config = {
    protected: false
}

export default plugin