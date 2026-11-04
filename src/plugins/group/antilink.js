/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { antilinkManager } from "#manager/antilink-manager.js"
import { chatManager } from "#manager/chat-manager.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, jid, text, isOwner, isAdmin, isBot } = ctx

    if (!chatManager.isGroupJid(jid)) {
        return await m.arashirep("Perintah antilink hanya dapat digunakan di dalam grup.")
    }

    if (!isBot) {
        return await m.arashirep("Bot belum menjadi admin.")
    }

    if (!isOwner && !isAdmin) {
        return await m.arashirep("Hanya admin grup atau owner yang dapat mengatur antilink.")
    }

    const rawTrimmed = (text || "").trim()
    const tokens = rawTrimmed.toLowerCase().split(/\s+/).filter(Boolean)
    const hasWaFlag = tokens.includes("wa")
    const arg = tokens.find(t => t !== "wa")

    const buildStatusText = () => {
        const current = antilinkManager.getConfig(jid)
        const status = (current.enabled && current.kind === "all")
            ? `Aktif${current.waBypass ? " (wa, link WhatsApp aman)" : " (semua link kena, termasuk WhatsApp)"}`
            : "Nonaktif"
        const whitelist = antilinkManager.getWhitelist(jid)
        const whitelistText = whitelist.length ? whitelist.map(w => `- ${w}`).join("\n") : "belum ada whitelist byy"
        return (
            `halo sayangg, disini aku bakal jelasin gimana cara pakai fitur antilink\n` +
            "antilink on [ ga perlu di jelasin kan? :3 ]\n" +
            "antilink on wa [ sama seperti di atas, tapi link WhatsApp (chat.whatsapp.com/whatsapp.com) di-bypass] \n" +
            "antilink off [ matikan fitur nya bisa pake ini ]\n" +
            "antilink status [ cek status antilink di grup ini, sama cek whitelist nya juga ]\n" +
            "antilink set wl url,url [ atur link yang mau kamu bypass atau lolos antilink biar ga di hapus ]\n\n" +
            "Tips: Admin dan Dev bypass fitur ini yaa.\n" +
            `btw antilink di grup ini ${status}, terus url yang di whitelist itu ada\n${whitelistText}`
        )
    }

    if (!arg || arg === "status") {
        return await m.arashirep(buildStatusText())
    }

    if (arg === "set") {
        const restTokens = rawTrimmed.split(/\s+/).slice(1)
        const wlKeyword = restTokens[0]?.toLowerCase()
        if (wlKeyword !== "wl" && wlKeyword !== "whitelist") {
            return await m.arashirep("Opsi set tidak dikenali. Gunakan: antilink set wl url,url")
        }
        const urlsRaw = restTokens.slice(1).join(" ")
        if (!urlsRaw) {
            return await m.arashirep("Kasih url-nya. Contoh: antilink set wl youtube.com,tiktok.com")
        }
        const urls = urlsRaw.split(",").map(u => u.trim()).filter(Boolean)
        const finalWhitelist = await antilinkManager.setWhitelist(jid, urls)
        return await m.arashirep(
            "Whitelist antilink berhasil diperbarui.\n\n" +
            (finalWhitelist.length ? finalWhitelist.map(w => `- ${w}`).join("\n") : "belum ada")
        )
    }

    if (arg === "off") {
        const current = antilinkManager.getConfig(jid)
        if (current.enabled && current.kind !== "all") {
            return await m.arashirep("Grup ini sedang menggunakan antilink. Untuk menonaktifkan gunakan antilink off.")
        }
        await antilinkManager.setConfig(jid, false)
        return await m.arashirep("Antilink dinonaktifkan di grup ini.")
    }

    if (arg === "on") {
        await antilinkManager.setConfig(jid, true, "all", { waBypass: hasWaFlag })
        const waNote = hasWaFlag ? ", kecuali link dari WhatsApp" : ", link whatsapp juga kena ya"
        return await m.arashirep(`Antilink diaktifkan, semua link akan langsung dihapus${waNote}.`)
    }

    return await m.arashirep("opsi ga valid, coba ketik antilink, disitu ada penjelasan nya")
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "antilink",
    commands: ["antilink"],
    categories: ["group"],
    description: "Hapus otomatis semua jenis link yang masuk ke grup, dengan opsi bypass link WhatsApp dan whitelist."
}

plugin.meta = {
    filename: "antilink.js",
    version: "3",
    author: "Kado",
    note: "nope",
    path: "group"
}

export default plugin