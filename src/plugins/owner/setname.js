import { config } from "#root/config.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return
    const { sock, m, q, text } = ctx

    const input = (q?.text || text)?.trim()
    if (!input) return await m.arashirep("masukkan nama baru untuk bot")

    try {
        await sock.updateProfileName(input)
        return await m.arashirep(`Berhasil ganti nama bot, menjadi ${input}`)
    } catch (err) {
        console.error(err)
        return await m.arashirep(`gagal ganti nama bot: ${err.message}`)
    }
}

const plugin = {
    run,
    name: "set bot name",
    commands: ["setname", "cn"],
    categories: ["owner"],
    description: "ganti nama bot"
}

plugin.meta = {
    filename: "setname.js",
    author: config.devName,
    note: "",
    version: "2",
    path: "owner"
}

export default plugin