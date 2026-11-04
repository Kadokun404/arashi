/**
 * @import {PluginCtx, PluginType} from "../types/types.js"
 */

const RLO = '\u202E' // Right-to-Left Override

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, q, text } = ctx

    const content = text || q?.text

    if (!content) return await m.arashirep('masukkan teks kak\ncontoh: rname halo dunia')

    const reversed = [...content].reverse().join('')

    await m.arashirep(`${RLO} ${reversed}`)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "reverse name",
    commands: ["rname", "rloname"],
    categories: ["tools"],
    description: "balik teks dengan unicode RTL override"
}

plugin.meta = {
    filename: "rloname.js",
    version: "2",
    author: "Kado",
    note: "gabut",
path: "tools"
}

export default plugin