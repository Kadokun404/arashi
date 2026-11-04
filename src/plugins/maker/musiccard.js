/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

const UPLOAD_ENDPOINT = "https://cloud.yardansh.com/upload"
const MUSICCARD_ENDPOINT = "https://api.nexray.eu.cc/canvas/musiccard"

/**
 * upload buffer gambar ke cloud.yardansh.com (uploader yang udah dipake di plugin lain,
 * contoh: tools/tourl.js), biar dapet direct link buat di kirim ke api musiccard
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {Promise<{url: string}>}
 */
async function uploadImage(buffer, filename = "image.jpg") {
    const formData = new FormData()
    formData.append("file", new Blob([buffer]), filename)

    const res = await fetch(UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData
    })

    if (!res.ok) throw new Error(`upload gagal: ${res.status} ${res.statusText}`)

    const data = await res.json()
    if (!data?.url) throw new Error(`upload gagal: response gak ada url nya`)

    return data
}

/**
 * ambil buffer gambar dari pesan utama (kalau kirim gambar + caption command)
 * atau dari pesan yang di reply (kalau reply gambar + command)
 * @param {PluginCtx} ctx
 * @returns {Promise<Buffer|undefined>}
 */
async function resolveImageBuffer(ctx) {
    const { m, q } = ctx

    if (q?.content === "imageMessage") return await q.download("buffer")
    if (m?.content === "imageMessage") return await m.download("buffer")

    return undefined
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, q, sock, jid, text } = ctx

    const hasImageTarget = q?.content === "imageMessage" || m?.content === "imageMessage"
    if (!hasImageTarget) {
        return await m.arashirep(
            `❌ *gambarnya mana nih?*\n\n` +
            `kirim gambar dengan caption *.musiccard <judul>|<nama artis>*, atau reply gambar yang udah ada dengan command yang sama\n\n` +
            `contoh: *.musiccard Perfect|Ed Sheeran*`
        )
    }

    if (!text?.trim()) {
        return await m.arashirep(
            `❌ *judul lagu & artis nya belum diisi!*\n\n` +
            `format: *.musiccard <judul>|<nama artis>*\n` +
            `pisahkan judul & nama artis pake simbol pita ( | )`
        )
    }

    let judul = text.trim()
    let nama = m.contact?.name || "Unknown Artist"

    if (judul.includes("|")) {
        const [judulPart, namaPart] = judul.split("|")
        judul = judulPart.trim()
        nama = namaPart?.trim() || nama
    }

    let mediaBuffer
    try {
        mediaBuffer = await resolveImageBuffer(ctx)
    } catch (e) {
        return await m.arashirep(`😔 *gagal download gambarnya.* coba kirim ulang ya`)
    }

    if (!mediaBuffer) {
        return await m.arashirep(`❌ *gambar gak kedetect!* pastiin kamu ngirim/reply gambar yang bener`)
    }

    await m.react("🕕")

    try {
        const uploadResult = await uploadImage(mediaBuffer, "musiccard.jpg")

        const apiUrl = `${MUSICCARD_ENDPOINT}?judul=${encodeURIComponent(judul)}&nama=${encodeURIComponent(nama)}&image_url=${encodeURIComponent(uploadResult.url)}`

        const res = await fetch(apiUrl)
        const contentType = res.headers.get("content-type") || ""

        if (!res.ok || !contentType.includes("image")) {
            await m.react("❌")
            return await m.arashirep(`⚠️ *gagal bikin music card.* server nya lagi bermasalah, coba lagi nanti ya`)
        }

        const cardBuffer = Buffer.from(await res.arrayBuffer())

        await sock.sendMessage(jid, {
            image: cardBuffer,
            caption: `✨ *MUSIC CARD BERHASIL DIBUAT!* ✨\n\n🎧 *judul*: ${judul}\n🎤 *artis*: ${nama}\n\nkeren kan? pamerin ke temen temen kamu yuk 🚀`
        }, { quoted: m })

        await m.react("✅")
    } catch (e) {
        console.error(`[musiccard]`, e)
        await m.react("☢")
        await m.arashirep(`😔 *terjadi masalah di sistem.* gagal menghubungi server pembuat music card, coba lagi beberapa saat lagi ya`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "music card",
    commands: ["musiccard", "mcard", "spotifycard"],
    categories: ["maker"],
    description: "bikin kartu musik (music card) keren dari gambar yang kamu kirim/reply.\n\n" +
        "cara pakai: *.musiccard <judul>|<nama artis>* (kirim/reply gambar dengan command ini)"
}

plugin.meta = {
    filename: "musiccard.js",
    author: "Kado",
    note: "port dari kode base lain (isOwner/isPremium/cooldown lama di buang, disesuaiin ke ctx & command-gate base ini). upload gambar pake cloud.yardansh.com biar konsisten sama tools/tourl.js, api canvas pake nexray",
    version: "1",
    path: "maker"
}

export default plugin