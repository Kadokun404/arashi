/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

async function run(ctx) {
    const { m, sock, jid, isAdmin } = ctx

    if (!jid?.endsWith("@g.us")) {
        return m.arashirep("command ini hanya untuk grup")
    }

    if (!isAdmin && !ctx.isOwner) {
        return m.arashirep("command ini khusus admin grup")
    }

    try {
        await sock.groupParticipantsUpdate(
            jid,
            ["867051314767696@bot"],
            "add"
        )

        await m.arashirep("sukses add meta ai ke grup")
    } catch (e) {
        console.error(e)
        await m.arashirep(String(e?.stack || e))
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "add meta ai",
    commands: ["addai"],
    categories: ["group"],
    description: "menambahkan meta ai ke grup"
}

plugin.meta = {
    filename: "addai.js",
    version: "1.0",
    author: "Kadokun",
    path: "group",
    note: "admin only dengan owner bypass"
}

export default plugin