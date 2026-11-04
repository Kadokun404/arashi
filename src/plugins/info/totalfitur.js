/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m } = ctx
    const pluginMap = ctx.pluginManager.pluginMap

    if (!pluginMap) return await m.arashirep('❌ pluginMap kosong.')

    const seen = new Set()
    const plugins = []
    for (const p of pluginMap.values()) {
        const key = p?.meta?.filename || p
        if (seen.has(key)) continue
        seen.add(key)
        plugins.push(p)
    }

    const totalFitur = plugins.length
    const totalCommand = pluginMap.size

    const kategoriMap = {}
    for (const p of plugins) {
        const cats = p.categories?.length ? p.categories : ['lainnya']
        for (const cat of cats) kategoriMap[cat] = (kategoriMap[cat] || 0) + 1
    }

    const kategoriText = Object.entries(kategoriMap)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, jml]) => `│ • ${cat} : ${jml} fitur`)
        .join('\n')

    const teks = `
╭─❒ *TOTAL FITUR BOT* ❒
│ Total fitur unik   : *${totalFitur}*
│ Total command/alias: *${totalCommand}*
│
${kategoriText}
╰────────────────
`.trim()

    await m.arashirep(teks)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "total fitur",
    commands: ["totalfitur", "totalfeature", "totfitur"],
    categories: ["info"],
    description: "Total fitur bot beserta rincian per kategori"
}

plugin.meta = {
    filename: "totalfitur.js",
    version: "2",
    author: "Kadokun",
    note: "",
    path: "info"
}

export default plugin