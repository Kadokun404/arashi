/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

// the code by Kadokun
// github.com/WolfyFlutter

const LANG_PATTERNS = [
    { lang: 'php', test: /<\?php/i },
    { lang: 'html', test: /<!DOCTYPE html>|<html[\s>]/i },
    { lang: 'css', test: /^[.#]?[\w-]+\s*\{[^}]*:[^}]*\}/m },
    { lang: 'python', test: /^\s*(def|class)\s+\w+.*:\s*$|^\s*(import|from)\s+\w+/m },
    { lang: 'java', test: /\bpublic\s+(static\s+)?(void|class)\b/ },
    { lang: 'csharp', test: /\busing\s+System;|\bnamespace\s+\w+/ },
    { lang: 'go', test: /\bpackage\s+main\b|\bfunc\s+main\s*\(/ },
    { lang: 'rust', test: /\bfn\s+main\s*\(|\blet\s+mut\b/ },
    { lang: 'bash', test: /^#!\/bin\/(ba)?sh/ },
    { lang: 'sql', test: /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b.+\b(FROM|VALUES|SET|WHERE)\b/i },
    { lang: 'typescript', test: /:\s*(string|number|boolean|any)\b|\binterface\s+\w+/ },
    { lang: 'javascript', test: /\b(const|let|var|function)\b|=>/ }
]

const LANG_EXT = {
    javascript: 'js', typescript: 'ts', python: 'py', php: 'php',
    html: 'html', css: 'css', java: 'java', csharp: 'cs',
    go: 'go', rust: 'rs', bash: 'sh', sql: 'sql', json: 'json'
}

function detectLang(code) {
    const trimmed = code.trim()
    try {
        JSON.parse(trimmed)
        return 'json'
    } catch {}
    for (const { lang, test } of LANG_PATTERNS) {
        if (test.test(code)) return lang
    }
    return 'javascript'
}

function buildTitle(lang) {
    return `${LANG_EXT[lang] || 'txt'} code`
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q } = ctx

    if (!q) return await m.arashirep('reply pesan yang ada teks/dokumen code-nya kak')

    let jsCode
    if (q.content === 'documentMessage') {
        try {
            jsCode = (await q.download('buffer')).toString('utf-8')
        } catch {}
    } else {
        jsCode = q.text
    }

    if (!jsCode) return await m.arashirep('reply pesan yang ada teks/dokumen code-nya kak')

    await m.arashirep('tunggu sebentar...')

    const lang = detectLang(jsCode)

    const r = await fetch('https://api.azbry.com/api/maker/code2img', {
        method: 'post',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: jsCode, lang, title: buildTitle(lang), mode: 'code' })
    })

    if (!r.ok) return await m.arashirep(await r.text())

    await sock.sendMessage(jid, { image: Buffer.from(await r.arrayBuffer()) }, { quoted: m })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "code to image",
    commands: ["c2i", "code2img"],
    categories: ["maker"],
    description: "ubah teks code jadi gambar, reply pesan/dokumen yang ada code-nya"
}

plugin.meta = {
    filename: "c2i.js",
    version: "4",
    author: "kado",
    note: "",
    path: "maker"
}

export default plugin