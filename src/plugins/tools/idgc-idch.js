import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, text, command } = ctx

    // cekidgc tanpa argument -> return jid grup sekarang
    if (command === 'cekidgc' || command === 'idgc' || command === 'getidgc') {
        if (!text) return await m.arashirep(m.chat.jid)

        // ada link invite grup
        if (text.includes('chat.whatsapp.com/')) {
            try {
                const raw = text.split('chat.whatsapp.com/')[1]
                const code = raw.split('/')[0].split('?')[0].trim()
                const res = await m.sock?.groupGetInviteInfo?.(code) ?? await ctx.sock.groupGetInviteInfo(code)
                if (!res?.id) return await m.arashirep('tidak dapat menemukan ID grup dari link tersebut')
                return await m.arashirep(res.id)
            } catch (err) {
                return await m.arashirep(`terjadi kesalahan: ${err.message}`)
            }
        }

        return await m.arashirep('link tidak valid, format: https://chat.whatsapp.com/xxx')
    }

    // cekidch - channel
    if (!text) return await m.arashirep(`kirim link channel nya\ncontoh: ${command} https://whatsapp.com/channel/xxx`)

    if (!text.includes('https://whatsapp.com/channel/'))
        return await m.arashirep('link tidak valid')

    try {
        const raw = text.split('https://whatsapp.com/channel/')[1]
        const result = raw.split('/')[0].split('?')[0].trim()
        const res = await ctx.sock.newsletterMetadata('invite', result)
        if (!res?.id) return await m.arashirep('tidak dapat menemukan ID channel dari link tersebut')
        return await m.arashirep(res.id)
    } catch (err) {
        return await m.arashirep(`terjadi kesalahan: ${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "cek id",
    commands: ["cekidch", "idch", "getidch", "cekidgc", "idgc", "getidgc"],
    categories: ["tools"],
    description: "ambil ID channel (cekidch) atau ID grup (cekidgc)"
}

plugin.meta = {
    filename: "idgc-idch.js",
    version: "3",
    author: config.devName,
    note: "cekidch = wa channel | cekidgc = wa group",
path: "tools"
}

export default plugin