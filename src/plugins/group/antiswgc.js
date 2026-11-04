/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { antiSwGcManager } from "#manager/antiswgc-manager.js"
import { chatManager } from "#manager/chat-manager.js"

const buildHelpText = (jid) => {
    const config = antiSwGcManager.getConfig(jid)
    return `antiswgc - block whatsapp story/status in group\n` +
        `status: ${config.enabled ? "on" : "off"}\n` +
        `kick: ${config.kick ? "on" : "off"}\n\n` +
        `usage:\n` +
        `• antiswgc on\n` +
        `• antiswgc off\n` +
        `• antiswgc kick <on|off>`
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, jid, text, isOwner, isAdmin } = ctx

    if (!chatManager.isGroupJid(jid)) {
        return await m.reply("antiswgc command can only be used in group chats.")
    }

    const isAllowed = isOwner || isAdmin
    if (!isAllowed) {
        return await m.reply("only group admins or bot owner can configure antiswgc.")
    }

    const tokens = (text || "").trim().toLowerCase().split(/\s+/).filter(Boolean)
    const arg = tokens[0]

    if (!arg || arg === "status" || arg === "-h" || arg === "help") {
        return await m.reply(buildHelpText(jid))
    }

    const isCurrentlyOn = antiSwGcManager.isEnabled(jid)
    const currentConfig = antiSwGcManager.getConfig(jid)

    if (arg === "on") {
        if (isCurrentlyOn) {
            return await m.reply("antiswgc is already on. want to turn it off? use 'antiswgc off'")
        }
        antiSwGcManager.enable(jid)
        return await m.reply("antiswgc enabled for this group.")
    }

    if (arg === "off") {
        if (!isCurrentlyOn) {
            return await m.reply("antiswgc is already off. want to turn it on? use 'antiswgc on'")
        }
        antiSwGcManager.disable(jid)
        return await m.reply("antiswgc disabled for this group.")
    }

    if (arg === "kick") {
        const sub = tokens[1]
        if (!sub) {
            const nextKick = !currentConfig.kick
            antiSwGcManager.setKick(jid, nextKick)
            return await m.reply(`antiswgc auto-kick ${nextKick ? "enabled" : "disabled"} for this group.`)
        }
        if (sub === "on") {
            if (currentConfig.kick) {
                return await m.reply("antiswgc auto-kick is already on. want to turn it off? use 'antiswgc kick off'")
            }
            antiSwGcManager.setKick(jid, true)
            return await m.reply("antiswgc auto-kick enabled for this group.")
        }
        if (sub === "off") {
            if (!currentConfig.kick) {
                return await m.reply("antiswgc auto-kick is already off. want to turn it on? use 'antiswgc kick on'")
            }
            antiSwGcManager.setKick(jid, false)
            return await m.reply("antiswgc auto-kick disabled for this group.")
        }
    }

    return await m.reply(buildHelpText(jid))
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "antiswgc",
    commands: ["antiswgc", "antisw"],
    categories: ["group"],
    description: "delete whatsapp status/story sent to group chat"
}

plugin.meta = {
    filename: "antiswgc.js",
    version: "1.1",
    author: "Kado",
    note: "delete groupStatusMessageV2 in group with optional auto-kick",
    path: "group"
}

export default plugin
