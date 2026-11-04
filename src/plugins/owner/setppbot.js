/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { config } from "#root/config.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return
    const { sock, q, m, prefix, command } = ctx

    const source = q?.content === "imageMessage"
        ? q
        : m?.content === "imageMessage"
            ? m
            : null

    if (!source) {
        return await m.arashirep(`reply foto atau kirim foto dengan caption command ya\n\ncontoh: *${prefix ? prefix + ' ' : ''}${command}* (reply ke foto, atau kirim foto + caption *${command}*)`)
    }

    try {
        const sharp = (await import('sharp')).default

        const inputBuffer = await source.download("buffer")
        const meta = await sharp(inputBuffer).metadata()
        const sizeKB = inputBuffer.length / 1024

        let buffer
        if (sizeKB > 900 || meta.width > 720 || meta.height > 720) {
            buffer = await sharp(inputBuffer)
                .resize(720, 720, { fit: 'inside' })
                .jpeg({ quality: 80 })
                .toBuffer()
        } else {
            buffer = inputBuffer
        }

        await sock.query({
            tag: "iq",
            attrs: {
                to: "@s.whatsapp.net",
                type: "set",
                xmlns: "w:profile:picture"
            },
            content: [
                {
                    tag: "picture",
                    attrs: { type: "image" },
                    content: buffer
                }
            ]
        })

        return await m.arashirep(`✅ foto profil bot berhasil diganti`)
    } catch (err) {
        console.error(err)
        return await m.arashirep(`gagal ganti foto profil bot: ${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "set profile picture bot",
    commands: ["setppbot", "setpp"],
    categories: ["owner"],
    description: "ganti foto profil bot (reply ke foto)"
}

plugin.meta = {
    filename: "setppbot.js",
    author: config.devName,
    note: "pake sock.query manual (bukan updateProfilePicture) + sharp compress biar ratio asli gak keubah",
    version: "2",
    path: "owner"
}

export default plugin