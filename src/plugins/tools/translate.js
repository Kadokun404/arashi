/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

const LANG_MAP = {
    id: 'id', en: 'en', jp: 'ja', ja: 'ja', kr: 'ko', ko: 'ko',
    ar: 'ar', cn: 'zh-CN', zh: 'zh-CN', th: 'th', vi: 'vi',
    de: 'de', fr: 'fr', es: 'es', it: 'it', ru: 'ru', pt: 'pt',
    nl: 'nl', hi: 'hi', ms: 'ms', tl: 'tl', tr: 'tr'
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, q, text } = ctx

    const content = q?.text

    if (!content) return await m.arashirep('reply pesan yang mau diterjemahkan\ncontoh: tr en to id\ntr en to jp')

    // parsing format: <from> to <to>
    const match = text?.match(/^(\w+)\s+to\s+(\w+)$/i)

    let source = 'auto'
    let target = 'id'

    if (match) {
        const [, from, to] = match
        source = LANG_MAP[from.toLowerCase()] || 'auto'
        target = LANG_MAP[to.toLowerCase()] || 'id'
    }

    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(content)}`)
        const json = await res.json()
        const translated = json[0].map(seg => seg[0]).join('')
        const detectedLang = json[2]

        if (detectedLang === target) {
            return await m.arashirep(`teks sudah dalam bahasa ${target}, tidak perlu diterjemahkan`)
        }

        await m.arashirep(`${translated}`)
    } catch (e) {
        await m.arashirep(`❌ gagal menerjemahkan:\n${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "translate",
    commands: ["tr", "translate", "terjemah"],
    categories: ["tools"],
    description: "terjemahkan pesan yang di-reply, format: tr <dari> to <ke>"
}

plugin.meta = {
    filename: "translate.js",
    version: "2",
    author: "Kado",
    note: "gabut",
    path: "tools"
}

export default plugin