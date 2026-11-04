/**
 * @import {PluginCtx, PluginType} from "../types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, text } = ctx

    if (!text) return await m.arashirep('masukkan domain kak\ncontoh: subdo yardansh.com')

    const domain = text.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')

    await m.arashirep(`mencari subdomain: ${domain}...`)

    try {
        const res = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`)

        if (!res.ok) return await m.arashirep('❌ gagal mengambil data dari crt.sh')

        const json = await res.json()

        if (!json.length) return await m.arashirep('❌ tidak ada subdomain ditemukan')

        const subdomains = new Set()

        for (const entry of json) {
            const names = entry.name_value.split('\n')
            for (const name of names) {
                if (name.includes('*')) continue
                subdomains.add(name.trim().toLowerCase())
            }
        }

        const sorted = [...subdomains].sort()

        let print = `ditemukan ${sorted.length} subdomain untuk ${domain}:\n\n` + sorted.slice(0, 100).join('\n')
        if (sorted.length > 100) print += `\n\n... dan ${sorted.length - 100} lainnya`

        await m.arashirep(print)
    } catch (e) {
        await m.arashirep(`❌ gagal memindai: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "subdomain finder",
    commands: ["subdo", "subdomain"],
    categories: ["tools"],
    description: "cari semua subdomain dari sertifikat SSL (crt.sh)"
}

plugin.meta = {
    filename: "subdo.js",
    version: "2",
    author: "Kado",
    note: "gabut",
path: "tools"
}

export default plugin