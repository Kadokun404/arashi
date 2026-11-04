import sharp from 'sharp'
import { config } from "#root/config.js"

/**
 * @import {PluginCtx} from "../../types/types.js"
 */

/**
 * 
 * @param {PluginCtx} ctx 
 * @returns {Promise<void>}
 */
async function run(ctx) {
    const { m, q, sock, jid } = ctx

    const wam = q || m

    if (wam.content !== 'imageMessage') {
        return await wam.arashirep('reply/kirim gambar dulu bre')
    }

    const imageBuffer = await wam.download('buffer')

    const thumbnailBuffer = await sharp(imageBuffer)
        .resize(128, 128, {
            fit: 'cover',
            position: 'centre'
        })
        .jpeg({
            quality: 90,
            progressive: true
        })
        .toBuffer()

    const base64Thumbnail = thumbnailBuffer.toString('base64')
    const sizeKb = (thumbnailBuffer.length / 1024).toFixed(1)

    return await sock.relayMessage(
        jid,
        {
            interactiveMessage: {
                header: {
                    title: `jpegThumbnail 128x128 • ${sizeKb}kb`
                },
                body: {
                    text: 'base64 siap dipakai buat field jpegThumbnail'
                },
                footer: { text: 'tools-tojpg' },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "cta_copy",
                            buttonParamsJson: JSON.stringify({
                                display_text: "copy base64",
                                copy_code: base64Thumbnail
                            })
                        }
                    ]
                },
                contextInfo: {
                    stanzaId: wam.key.id,
                    participant: wam.key.participant || wam.key.remoteJid,
                    quotedMessage: wam.message
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
                            attrs: {
                                type: "native_flow",
                                v: "1",
                            },
                            content: [
                                {
                                    tag: "native_flow",
                                    attrs: {
                                        v: "9",
                                        name: "mixed",
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        }
    )
}

const plugin = { run }

plugin.name = "to jpegThumbnail"
plugin.commands = ["tojpg", "tothumb"]
plugin.categories = ["tools"]
plugin.description = "kompres gambar ke 128x128 jpeg dan kirim base64-nya lewat tombol copy, buat dipake sebagai jpegThumbnail"

plugin.meta = {
    filename: "tojpg.js",
    author: config.devName,
    note: "",
    version: "1",
    path: "tools"
}

export default plugin