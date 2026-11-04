/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { banManager } from "#manager/ban-manager.js"
import { resolveTarget } from "#helper/resolve-target.js"
import { parseDurationMs } from "#helper/parse-duration.js"

const HELP_TEXT = `fitur ban user - blokir user agar tidak direspon oleh bot\n\n` +
    `penggunaan:\n` +
    `• ban @user [durasi] [alasan] (atau reply pesan target)\n` +
    `• unban @user (atau reply pesan target)\n` +
    `• listban / ban list\n\n` +
    `contoh:\n` +
    `• ban @user 1h spam\n` +
    `• ban @user 30m\n` +
    `• ban @user (permanen)\n` +
    `• unban @user`

/**
 * @param {string|undefined} argument
 * @returns {{durationMs: number|null, reason: string|undefined}}
 */
function parseBanArgs(argument) {
    const raw = (argument || "").trim()
    if (!raw) return { durationMs: null, reason: undefined }

    const tokens = raw.split(/\s+/)
    const firstToken = tokens[0]
    const durMs = parseDurationMs(firstToken)

    if (durMs !== null) {
        const reason = tokens.slice(1).join(" ").trim() || undefined
        return { durationMs: durMs, reason }
    }

    if (tokens.length >= 2) {
        const twoTokens = tokens.slice(0, 2).join(" ")
        const twoDurMs = parseDurationMs(twoTokens)
        if (twoDurMs !== null) {
            const reason = tokens.slice(2).join(" ").trim() || undefined
            return { durationMs: twoDurMs, reason }
        }
    }

    return { durationMs: null, reason: raw }
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, sock, jid, text, command, isOwner } = ctx

    if (!isOwner) {
        return await m.reply("perintah ini khusus untuk owner/developer bot.")
    }

    const cmd = (command || "").toLowerCase()
    const trimmed = (text || "").trim()

    // 1. LIST BAN
    if (cmd === "listban" || trimmed === "list") {
        const list = banManager.listBanned()
        if (!list.length) {
            return await m.reply("tidak ada user yang sedang di-ban.")
        }

        let out = `DAFTAR USER TER-BAN (${list.length})\n━━━━━━━━━━━━━━━━\n`
        const mentions = []

        list.forEach((item, i) => {
            const targetJid = item.pn || item.lid || "unknown"
            const num = targetJid.split("@")[0]
            if (targetJid.includes("@")) mentions.push(targetJid)
            if (item.lid && !mentions.includes(item.lid)) mentions.push(item.lid)

            const remaining = banManager.formatRemaining(item.expiresAt)
            out += `${i + 1}. @${num}${item.name ? ` (${item.name})` : ""}\n`
            out += `   Durasi: ${remaining}\n`
            if (item.reason) out += `   Alasan: ${item.reason}\n`
        })

        return await sock.sendMessage(jid, { text: out.trim(), mentions }, { quoted: m })
    }

    // 2. UNBAN
    if (cmd === "unban" || cmd === "unbanuser") {
        const target = resolveTarget(ctx)
        if (!target.lid && !target.pn) {
            return await m.reply("tag user atau reply pesan user yang ingin di-unban.\ncontoh: unban @user")
        }

        const res = banManager.unban({ lid: target.lid, pn: target.pn })
        if (!res.ok) {
            return await m.reply(res.message)
        }

        const mentionTarget = target.pn || target.lid
        const num = mentionTarget.split("@")[0]
        return await sock.sendMessage(jid, {
            text: `user @${num} berhasil di-unban. sekarang sudah bisa berinteraksi lagi dengan bot.`,
            mentions: [mentionTarget]
        }, { quoted: m })
    }

    // 3. BAN
    const target = resolveTarget(ctx)
    if (!target.lid && !target.pn) {
        return await m.reply(HELP_TEXT)
    }

    const { durationMs, reason } = parseBanArgs(target.argument)
    const authorContact = m.contact?.pn || m.contact?.lid || m.sender

    const res = banManager.ban(
        { lid: target.lid, pn: target.pn, name: target.name },
        { durationMs, reason, bannedBy: authorContact }
    )

    if (!res.ok) {
        return await m.reply(res.message)
    }

    const mentionTarget = target.pn || target.lid
    const num = mentionTarget.split("@")[0]
    const durLabel = res.record?.expiresAt
        ? banManager.formatRemaining(res.record.expiresAt)
        : "Permanen"

    let out = `user @${num} berhasil di-ban.\n` +
        `• Durasi : ${durLabel}\n`
    if (reason) out += `• Alasan : ${reason}\n`
    out += `\nuser ini tidak akan direspon oleh bot sampai masa ban berakhir.`

    return await sock.sendMessage(jid, {
        text: out.trim(),
        mentions: [mentionTarget]
    }, { quoted: m })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "ban user",
    commands: ["ban", "unban", "listban", "banuser", "unbanuser"],
    categories: ["owner"],
    description: "ban / unban user agar tidak direspon oleh bot, support durasi dan alasan"
}

plugin.meta = {
    filename: "ban.js",
    version: "1.0",
    author: "Kadokun",
    note: "ban user with time and reason support",
    path: "owner"
}

export default plugin
