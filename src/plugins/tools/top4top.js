/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import uploadTop4top from "#helper/top4top.js"

const mb = b => (b / 1024 / 1024).toFixed(2) + " MB"
const kb = b => (b / 1024).toFixed(1) + " KB"

const MEDIA_TYPES = ["imageMessage", "videoMessage", "documentMessage", "stickerMessage", "audioMessage"]

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, sock, jid, q } = ctx

    let target = null
    if (q && MEDIA_TYPES.includes(q.content)) target = q
    else if (MEDIA_TYPES.includes(m.content)) target = m

    if (!target) return await m.arashirep("reply atau kirim gambar/video/dokumen (dengan caption) yang mau diupload jadi link")

    await m.react("⏳")

    try {
        const buffer = await target.download("buffer")
        const { url, ext, mime, size } = await uploadTop4top(buffer)

        await sock.relayMessage(
            jid,
            {
                interactiveMessage: {
                    header: { title: "Top4Top Uploader" },
                    body: {
                        text: `Upload berhasil!\n\nTipe   : ${mime} (.${ext})\nUkuran : ${size > 1024 * 1024 ? mb(size) : kb(size)}`
                    },
                    footer: { text: "t4t" },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: "cta_copy",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "salin link",
                                    copy_code: url
                                })
                            },
                            {
                                name: "cta_url",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "buka link",
                                    url
                                })
                            }
                        ]
                    },
                    contextInfo: {
                        stanzaId: m.key.id,
                        participant: m.key.participant || m.key.remoteJid,
                        quotedMessage: m.message
                    }
                }
            },
            {
                additionalNodes: [
                    {
                        tag: "biz",
                        attrs: {},
                        content: [
                            {
                                tag: "interactive",
                                attrs: { type: "native_flow", v: "1" },
                                content: [
                                    { tag: "native_flow", attrs: { v: "9", name: "mixed" } }
                                ]
                            }
                        ]
                    }
                ]
            }
        )

        await m.react("✅")
    } catch (e) {
        await m.react("❌")
        return await m.arashirep(`❌ gagal upload: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "top4top uploader",
    commands: ["t4t"],
    categories: ["tools"],
    description: "reply atau kirim media (gambar/video/dokumen/stiker/audio) dengan caption buat dijadiin direct link lewat top4top.io, hasil dengan tombol salin link"
}

plugin.meta = {
    filename: "top4top.js",
    version: "3",
    author: "Kado",
    note: "upload lewat helper/top4top.js, hasil pakai cta_copy + cta_url, kredit original uploader: © JamvanHax0r — Fiony Bot",
    path: "tools"
}

export default plugin
