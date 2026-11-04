import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

async function run(ctx) {
    const { sock, jid, m, text } = ctx
    await m.react("⏳")

    try {
        const res = await fetch(
            `https://api.theresav.eu/api/download/sfile?url=${encodeURIComponent(text)}`,
            { headers: { "x-apikey": config.apikey.theresav } }
        )

        const data = await res.json()

        if (!data.status) throw new Error("Gagal mendapatkan file")

        const { meta, links } = data.result

        await sock.sendMessage(jid, {
            document: {
                url: links.direct_cdn_link
            },
            mimetype: meta.mime_type,
            fileName: meta.title
        })

        await m.react("✅")
    } catch (e) {
        await m.react("❌")
        await m.arashirep(`❌ ${e.message}`)
    }
}

const plugin = {
    run,
    name: "sfile downloader",
    commands: ["sfile"],
    categories: ["downloader"],
    description: "Download file dari SFile"
}

plugin.meta = {
    filename: "sfile.js",
    version: "1.0",
    author: "Kadokun",
    path: "downloader",
note: "gd"
}

export default plugin