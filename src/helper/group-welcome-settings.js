import { ownerManager } from "#manager/owner-manager.js"
import { chatManager } from "#manager/chat-manager.js"
import {
    groupWelcomeManager,
    DEFAULT_WELCOME_MESSAGE,
    DEFAULT_GOODBYE_MESSAGE,
    DEFAULT_PROMOTE_MESSAGE,
    DEFAULT_DEMOTE_MESSAGE
} from "#manager/group-welcome-manager.js"

/**
 * @import {PluginCtx} from "#types/types.js"
 */

const COMMAND_BY_KIND = {
    welcome: "welcome",
    goodbye: "goodbye",
    promote: "promote",
    demote: "demote"
}

const DEFAULT_MESSAGE_BY_KIND = {
    welcome: DEFAULT_WELCOME_MESSAGE,
    goodbye: DEFAULT_GOODBYE_MESSAGE,
    promote: DEFAULT_PROMOTE_MESSAGE,
    demote: DEFAULT_DEMOTE_MESSAGE
}

/**
 * @param {"welcome"|"goodbye"|"promote"|"demote"} kind
 * @param {string} [jid]
 * @returns {string}
 */
function buildHelpText(kind, jid) {
    const defaultMsg = DEFAULT_MESSAGE_BY_KIND[kind]
    const hasBackground = kind === "welcome" || kind === "goodbye"

    let statusLine = ""
    if (jid) {
        let isEnabled = false
        if (kind === "welcome") isEnabled = !!groupWelcomeManager.getWelcomeSettings(jid)?.enabled
        else if (kind === "goodbye") isEnabled = !!groupWelcomeManager.getGoodbyeSettings(jid)?.enabled
        else if (kind === "promote") isEnabled = !!groupWelcomeManager.getPromoteSettings(jid)?.enabled
        else if (kind === "demote") isEnabled = !!groupWelcomeManager.getDemoteSettings(jid)?.enabled

        statusLine = `status: ${isEnabled ? "on" : "off"}\n`
    }

    let text = `${kind} - group event settings\n` +
        (statusLine ? `${statusLine}\n` : "\n") +
        `usage:\n` +
        `• ${kind} on [message]${hasBackground ? " [bg-url]" : ""}\n` +
        `• ${kind} off\n`

    if (kind === "welcome") {
        text += `• ${kind} autodelete <seconds|off>\n`
    }

    text += `\nplaceholders: {mention} {name} {group} {count}\n` +
        `default: ${defaultMsg}`

    return text
}

/**
 * parsing "on/off <pesan...> <bg-url>", bg-url di deteksi kalau token terakhir
 * berupa url (http/https), sisanya di anggep pesan
 * @param {string} rest
 * @returns {{state: "on"|"off"|undefined, message: string|undefined, background: string|undefined}}
 */
function parseArgs(rest) {
    const trimmed = (rest || "").trim()
    const [first, ...restTokens] = trimmed.split(/\s+/)
    const state = first?.toLowerCase()

    if (state !== "on" && state !== "off") {
        return { state: undefined, message: undefined, background: undefined }
    }

    const remainder = restTokens.join(" ").trim()
    if (!remainder) return { state, message: undefined, background: undefined }

    const tokens = remainder.split(/\s+/)
    const lastToken = tokens[tokens.length - 1]
    const isUrl = /^https?:\/\//i.test(lastToken)

    if (isUrl) {
        return {
            state,
            message: tokens.slice(0, -1).join(" ").trim() || undefined,
            background: lastToken
        }
    }

    return { state, message: remainder, background: undefined }
}

const SETTER_BY_KIND = {
    welcome: (jid, enabled, opts) => groupWelcomeManager.setWelcome(jid, enabled, opts),
    goodbye: (jid, enabled, opts) => groupWelcomeManager.setGoodbye(jid, enabled, opts),
    promote: (jid, enabled, opts) => groupWelcomeManager.setPromote(jid, enabled, opts),
    demote: (jid, enabled, opts) => groupWelcomeManager.setDemote(jid, enabled, opts)
}

/**
 * @param {PluginCtx} ctx
 * @param {"welcome"|"goodbye"|"promote"|"demote"} kind
 */
async function runSetGroupEvent(ctx, kind) {
    const { m, jid, text } = ctx
    const command = COMMAND_BY_KIND[kind]

    if (!chatManager.isGroupJid(jid)) {
        return await m.reply(`'${command}' can only be used in group chats.`)
    }

    const isAllowed = ownerManager.isOwner(m.contact) || !!m.group?.admin
    if (!isAllowed) {
        return await m.reply(`only group admins or bot owner can configure '${command}'.`)
    }

    // subcommand khusus welcome: "welcome autodelete <detik|off>"
    if (kind === "welcome") {
        const trimmed = (text || "").trim()
        const [sub, ...restTokens] = trimmed.split(/\s+/)
        if (sub?.toLowerCase() === "autodelete") {
            const value = (restTokens.join(" ") || "").trim().toLowerCase()
            const seconds = value === "off" || value === "0" ? 0 : parseInt(value, 10)
            if (Number.isNaN(seconds) || seconds < 0) {
                return await m.reply(`specify seconds or 'off'. example: welcome autodelete 30`)
            }
            const result = await groupWelcomeManager.setWelcomeAutoDelete(jid, seconds)
            return await m.reply(result.message)
        }
    }

    const { state, message, background } = parseArgs(text)
    if (!state) return await m.reply(buildHelpText(kind, jid))

    const enabled = state === "on"
    const result = await SETTER_BY_KIND[kind](jid, enabled, { message, background })

    return await m.reply(result.message)
}

export { runSetGroupEvent, buildHelpText }
