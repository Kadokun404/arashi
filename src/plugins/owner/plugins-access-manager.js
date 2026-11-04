/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { pamManager } from "#manager/pam-manager.js"
import { config } from "#root/config.js"

const HELP_TEXT = `pam - plugin access manager\n\n` +
    `usage:\n` +
    `• pam grant <user/group> <commands>\n` +
    `• pam grant group <commands>\n` +
    `• pam group <commands>\n` +
    `• pam remove <user/group> [commands]\n` +
    `• pam view\n` +
    `• pam nuke`

/**
 * Parsing target and commands from context
 * @param {PluginCtx} ctx
 */
function resolvePamTargetAndCommands(ctx) {
    const { m, q, text, jid } = ctx
    const raw = (text || "").trim()

    // 1. Reply
    if (q?.contact) {
        return {
            targets: [{
                type: "user",
                lid: q.contact.lid,
                pn: q.contact.pn,
                name: q.contact.name || "user"
            }],
            commands: raw.split(/\s+/).filter(Boolean)
        }
    }

    // 2. Mentions
    const mentionedJid = m?.message?.[m?.content]?.contextInfo?.mentionedJid
    if (mentionedJid?.length) {
        const targets = mentionedJid.map(tJid => {
            const contact = ctx.contactStore?.resolve?.(tJid) ||
                            ctx.contactStore?.getByLid?.(tJid) ||
                            ctx.contactStore?.getByPn?.(tJid)
            return {
                type: "user",
                lid: contact?.lid || (tJid.endsWith("@lid") ? tJid : undefined),
                pn: contact?.pn || (tJid.endsWith("@s.whatsapp.net") ? tJid : undefined),
                name: contact?.name || "user"
            }
        })
        const cleanText = raw.replace(/@\d+/g, "").trim()
        const commands = cleanText.split(/\s+/).filter(Boolean)
        return { targets, commands }
    }

    const tokens = raw.split(/\s+/).filter(Boolean)
    if (!tokens.length) {
        return { targets: [], commands: [] }
    }

    // 3. Group keywords
    const firstTokenLower = tokens[0].toLowerCase()
    if (["group", "gc", "here", "grup"].includes(firstTokenLower)) {
        if (!jid?.endsWith("@g.us")) {
            return {
                isGroupError: true,
                errorMessage: "group target can only be used inside a group chat.",
                targets: [],
                commands: []
            }
        }
        const groupName = m.chat?.name || "group"
        return {
            targets: [{
                type: "group",
                jid,
                name: groupName
            }],
            commands: tokens.slice(1)
        }
    }

    // 4. Phone number prefix
    const numberOnly = tokens[0].replace(/[^0-9]/g, "")
    if (numberOnly.length >= 8) {
        const pn = `${numberOnly}@s.whatsapp.net`
        const contact = ctx.contactStore?.getByPn?.(pn)
        return {
            targets: [{
                type: "user",
                lid: contact?.lid,
                pn,
                name: contact?.name || "user"
            }],
            commands: tokens.slice(1)
        }
    }

    // 5. Contact store match by name prefix
    const maxWords = Math.min(tokens.length, 3)
    for (let count = maxWords; count >= 1; count--) {
        const candidateName = tokens.slice(0, count).join(" ")
        const found = ctx.contactStore?.getByName?.(candidateName)
        if (found) {
            return {
                targets: [{
                    type: "user",
                    lid: found.lid,
                    pn: found.pn,
                    name: found.name || candidateName
                }],
                commands: tokens.slice(count)
            }
        }
    }

    // 6. Manual name token
    if (tokens.length >= 2) {
        return {
            targets: [{
                type: "user",
                name: tokens[0]
            }],
            commands: tokens.slice(1)
        }
    }

    // 7. Group shortcut (inside group chat with 1 command)
    if (jid?.endsWith("@g.us") && tokens.length === 1) {
        return {
            targets: [{
                type: "group",
                jid,
                name: m.chat?.name || "group"
            }],
            commands: tokens
        }
    }

    return { targets: [], commands: tokens }
}

/**
 * @param {PluginCtx} ctx
 */
async function runGrant(ctx) {
    const { m } = ctx
    const parsed = resolvePamTargetAndCommands(ctx)

    if (parsed.isGroupError) {
        return await m.arashirep(parsed.errorMessage)
    }

    if (!parsed.targets.length) {
        return await m.arashirep(`target not found. specify a name, mention, or 'group'.`)
    }

    if (!parsed.commands.length) {
        return await m.arashirep(`commands missing. example: pam grant group ping`)
    }

    const authorContact = m.contact
    const result = await pamManager.grant({
        targets: parsed.targets,
        commands: parsed.commands,
        grantedBy: { lid: authorContact?.lid, pn: authorContact?.pn },
        pluginManager: ctx.pluginManager
    })

    return await m.arashirep(result.message)
}

/**
 * @param {PluginCtx} ctx
 */
async function runRemove(ctx) {
    const { m } = ctx
    const parsed = resolvePamTargetAndCommands(ctx)

    if (parsed.isGroupError) {
        return await m.arashirep(parsed.errorMessage)
    }

    if (!parsed.targets.length) {
        return await m.arashirep(`target not found. specify a name, mention, or 'group'.`)
    }

    const result = await pamManager.revoke({
        targets: parsed.targets,
        commands: parsed.commands
    })

    return await m.arashirep(result.message)
}

/**
 * @param {PluginCtx} ctx
 */
async function runView(ctx) {
    const { m } = ctx
    const items = pamManager.view()
    if (!items.length) {
        return await m.arashirep(`no pam access configured.`)
    }

    const groups = items.filter(i => i.type === "group" || i.jid?.endsWith("@g.us"))
    const users = items.filter(i => i.type !== "group" && !i.jid?.endsWith("@g.us"))

    const sections = []

    if (groups.length) {
        const lines = groups.map(g => `• ${g.name}\n  access: ${g.commands.join(", ")}`)
        sections.push(`groups:\n${lines.join("\n\n")}`)
    }

    if (users.length) {
        const lines = users.map(u => `• ${u.name}\n  access: ${u.commands.join(", ")}`)
        sections.push(`users:\n${lines.join("\n\n")}`)
    }

    const text = `pam access list\n\n` + sections.join("\n\n")
    return await m.arashirep(text)
}

/**
 * @param {PluginCtx} ctx
 */
async function runNuke(ctx) {
    const { m } = ctx
    const result = await pamManager.nuke()
    return await m.arashirep(result.message)
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return
    const { text, m, jid } = ctx

    const trimmed = (text || "").trim()
    const tokens = trimmed.split(/\s+/).filter(Boolean)
    const subcommand = tokens[0]?.toLowerCase()
    const rest = tokens.slice(1).join(" ")
    const subCtx = { ...ctx, text: rest }

    if (subcommand === "grant") return await runGrant(subCtx)
    if (subcommand === "remove" || subcommand === "revoke" || subcommand === "del") return await runRemove(subCtx)
    if (subcommand === "view" || subcommand === "list") return await runView(subCtx)
    if (subcommand === "nuke" || subcommand === "reset") return await runNuke(subCtx)

    // Group shortcut
    if (subcommand === "group" || subcommand === "gc") {
        if (!jid?.endsWith("@g.us")) {
            return await m.arashirep("group command can only be used inside a group chat.")
        }
        const action = tokens[1]?.toLowerCase()
        if (action === "remove" || action === "revoke" || action === "del") {
            const groupSubCtx = { ...ctx, text: `group ${tokens.slice(2).join(" ")}` }
            return await runRemove(groupSubCtx)
        }
        if (action === "view" || action === "list") {
            return await runView(subCtx)
        }
        if (action === "grant") {
            const groupSubCtx = { ...ctx, text: `group ${tokens.slice(2).join(" ")}` }
            return await runGrant(groupSubCtx)
        }
        const groupSubCtx = { ...ctx, text: `group ${tokens.slice(1).join(" ")}` }
        return await runGrant(groupSubCtx)
    }

    if (subcommand === "-h" || subcommand === "help" || !subcommand) {
        return await m.arashirep(HELP_TEXT)
    }

    return await m.arashirep(`unknown subcommand '${subcommand}'.\n\n${HELP_TEXT}`)
}

/** @type {PluginType} */
const plugin = { run }

plugin.name = "plugin access manager"
plugin.commands = ["pam"]
plugin.categories = ["owner"]
plugin.description = "manage plugin access permissions for users and groups"

plugin.meta = {
    filename: "plugins-access-manager.js",
    author: config.devName,
    note: "minimalist english pam layout",
    version: "4",
    path: "owner"
}

export default plugin
