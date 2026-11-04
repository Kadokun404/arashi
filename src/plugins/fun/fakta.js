/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid } = ctx

    const res = await fetch('https://api.azbry.com/api/random/fakta')
    const json = await res.json()

    if (!json.status || !json.result?.fakta) return await m.arashirep('❌ gagal mengambil fakta')

    const original = json.result.fakta

    const translateRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=id&dt=t&q=${encodeURIComponent(original)}`)
    const translateJson = await translateRes.json()
    const translated = translateJson[0].map(seg => seg[0]).join('')

    const factMsg = await m.arashirep(translated)

    await sock.sendMessage(jid, {
        audio: { url: 'https://cloud.yardansh.com/v2vKgZ.mpeg' },
        mimetype: 'audio/mpeg',
        ptt: false
    }, { quoted: factMsg })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "fakta",
    commands: ["fakta", "fact"],
    categories: ["fun"],
    description: "kasih fakta random (translate ke bahasa indonesia)"
}

plugin.meta = {
    filename: "fakta.js",
    version: "2",
    author: "Kado",
    note: "gabut",
    path: "fun"
}

export default plugin