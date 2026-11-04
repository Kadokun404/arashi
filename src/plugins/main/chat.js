/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { isJidGroup } from "baileys"
import { chatManager, GroupListenMode, PrivateListenMode } from "#manager/chat-manager.js"
import { config } from "#root/config.js"

const GROUP_MODE_LABEL = ['self', 'public', 'default']
const PRIVATE_MODE_LABEL = ['self', 'public']

const HELP_TEXT = `ya, baca docs kalo lupa`

/**
 * @param {PluginCtx} ctx
 * @returns {Promise<any>}
 */
async function run(ctx) {
    const { m, jid, text } = ctx
if (!ctx.isOwner) return 
    const args = (text || '').trim().split(/\s+/).filter(Boolean)
    const opt = args[0]?.toLowerCase()
    const toggle = args[1]?.toLowerCase()

    if (!opt) {
        const status = chatManager.getStatus(jid)
        const gc = `🧑‍🧑‍🧒‍🧒 group: *${GROUP_MODE_LABEL[status.groupMode]}*`
        const tg = (isJidGroup(jid) && status.groupMode === GroupListenMode.DEFAULT)
            ? ` *(${status.listen ? 'on' : 'off'})*`
            : ''
        const pc = `👥 private: *${PRIVATE_MODE_LABEL[status.privateMode]}*`
        return await m.arashirep('💬 chat mode\n\n' + gc + tg + '\n' + pc + `\n\nketik *chat -h* untuk bantuan`)
    }

    if (opt === "group") {
        if (toggle === "self") {
            const changed = await chatManager.groupChatToggle(GroupListenMode.SELF)
            return await m.arashirep(changed
                ? `✅ chat grup di set ke *self* (bot cuma listen ke owner/trusted di semua grup)`
                : `udah di mode ini kok`)
        }
        if (toggle === "public") {
            const changed = await chatManager.groupChatToggle(GroupListenMode.PUBLIC)
            return await m.arashirep(changed
                ? `✅ chat grup di set ke *public* (bot listen ke siapapun di semua grup)`
                : `udah di mode ini kok`)
        }
        if (toggle === "default") {
            const changed = await chatManager.groupChatToggle(GroupListenMode.DEFAULT)
            return await m.arashirep(changed
                ? `✅ chat grup di set ke *default* (bot listen sesuai whitelist per-grup, pake *chat on/off*)`
                : `udah di mode ini kok`)
        }
        return await m.arashirep(`param gak valid, available: self, public, default\n\nketik *chat -h* untuk bantuan`)
    }

    if (opt === "private") {
        if (toggle === "self") {
            const changed = await chatManager.privateChatToggle(PrivateListenMode.SELF)
            return await m.arashirep(changed
                ? `✅ private chat di set ke *self* (bot cuma listen ke owner/trusted)`
                : `udah di mode ini kok`)
        }
        if (toggle === "public") {
            const changed = await chatManager.privateChatToggle(PrivateListenMode.PUBLIC)
            return await m.arashirep(changed
                ? `✅ private chat di set ke *public* (bot listen ke siapapun)`
                : `udah di mode ini kok`)
        }
        return await m.arashirep(`param gak valid, available: self, public\n\nketik *chat -h* untuk bantuan`)
    }

    if (opt === "on") {
        if (!isJidGroup(jid)) return await m.arashirep(`❌ command ini cuma bisa dipake di dalam grup`)
        const name = args.slice(1).join(' ').trim() || m.chat?.name || jid
        const added = await chatManager.manageGroupsWhitelist("add", jid, name)
        return await m.arashirep(added ? `✅ bot aktif untuk grup ini` : `🔔 grup ini udah aktif kok`)
    }

    if (opt === "off") {
        if (!isJidGroup(jid)) return await m.arashirep(`❌ command ini cuma bisa dipake di dalam grup`)
        const removed = await chatManager.manageGroupsWhitelist("remove", jid)
        return await m.arashirep(removed ? `✅ bot di bisuin buat grup ini` : `🔔 grup ini emang udah nonaktif kok`)
    }

    return await m.arashirep(HELP_TEXT)
}

/**@type {PluginType} */
const plugin = { run }

plugin.name = "chat manager"
plugin.commands = ["chat"]
plugin.categories = ["main"]
plugin.description = "plugin buat manage response bot tiap chat (mirip bot mode publik/self tapi lebih fleksibel dan gampang dipake).\n" +
    "chat di bagi jadi 2 jenis: *private* dan *group*. private punya 2 mode (self, public), group punya 3 mode (self, public, default).\n" +
    "mode self & public di group itu *meng-override* whitelist per-grup, tapi whitelist nya tetap kesimpen (kalau balik lagi ke mode default, setting lama masih dipake).\n\n" +
    HELP_TEXT

plugin.meta = {
    filename: "chat.js",
    author: config.devName,
    note: "ported dari chat-manager kadomatcha (group self/public/default + private self/public + whitelist per-grup), di simpan ke data/chat-manager-config.json",
    version: "2",
    path: "main"
}

plugin.config = {
    protected: true
}

export default plugin