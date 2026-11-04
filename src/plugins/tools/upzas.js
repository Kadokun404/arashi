import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

const SUPPORTED_TYPES = ["imageMessage", "videoMessage", "stickerMessage"]

const EXT_MAP = {
    imageMessage: "jpg",
    videoMessage: "mp4",
    stickerMessage: "webp"
}

/**
 * Fungsi untuk mendapatkan tipe konten dari berbagai struktur pesan
 */
function getContentType(msg) {
    if (!msg) return null
    // Cek properti content langsung
    if (typeof msg.content === "string" && SUPPORTED_TYPES.includes(msg.content)) {
        return msg.content
    }
    // Cek di dalam msg.message (jika ada)
    if (msg.message) {
        const key = Object.keys(msg.message).find(k => SUPPORTED_TYPES.includes(k))
        if (key) return key
    }
    // Cek di msg.quotedMsg?.content atau msg.quoted?.content
    return null
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, q, m, prefix, command } = ctx

    // Kandidat sumber media: pesan utama (m), quoted dari ctx (q), atau properti quoted pada m
    const quoted = q || m?.quoted || m?.quotedMsg
    const candidates = [m, quoted]
    
    // Cari kandidat pertama yang memiliki tipe media didukung
    const source = candidates.find(msg => getContentType(msg))

    if (!source) {
        return await m.arashirep(`reply/kirim gambar, video, atau stiker ya\n\ncontoh: *${prefix ? prefix + ' ' : ''}${command}* (reply ke media, atau kirim media + caption *${command}*)`)
    }

    try {
        // Pastikan source punya method download, jika tidak mungkin perlu ambil dari m atau quoted asli
        const buffer = await source.download("buffer")
        const ext = EXT_MAP[getContentType(source)]
        const fileName = `upload_${Date.now()}.${ext}`

        const form = new FormData()
        form.append("file", new Blob([buffer]), fileName)

        const res = await fetch("https://cdn.zass.in/upload", {
            method: "POST",
            body: form
        })

        const data = await res.json()

        if (!data.success) {
            return await m.arashirep(`gagal upload: ${data.message || "unknown error"}`)
        }

        const jid = m.chat.jid

        const content = {
            interactiveMessage: {
                header: {
                    title: "file uploaded"
                },
                body: {
                    text: `size : ${data.size}\nname : ${data.fileName}`
                },
                footer: {
                    text: "powered by cdn.zass.in"
                },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "cta_copy",
                            buttonParamsJson: JSON.stringify({
                                display_text: "copy url",
                                copy_code: data.url
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "visit url",
                                url: data.url
                            })
                        }
                    ],
                    messageParamsJson: JSON.stringify({})
                }
            }
        }

        const relayOptions = {
            messageId: "UPZ" + Date.now()
        }

        return await sock.relayMessage(jid, content, relayOptions)
    } catch (err) {
        console.error(err)
        return await m.arashirep(`gagal upload: ${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "upload zass",
    commands: ["upzas"],
    categories: ["tools"],
    description: "upload gambar/video/stiker ke cdn.zass.in (reply atau kirim + caption command)"
}

plugin.meta = {
    filename: "upzas.js",
    author: config.devName,
    note: "upload ke https://cdn.zass.in/upload, support image/video/sticker, hasil pake sock.relayMessage interactiveMessage (cta_copy + cta_url)",
    version: "1.1",
    path: "tools"
}

export default plugin