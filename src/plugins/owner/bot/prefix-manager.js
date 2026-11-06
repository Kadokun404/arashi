/**
 * @import {PluginCtx, Plugin} from "../../types/types.js"
 */

const HELP_TEXT =
`*Prefix Manager*

• *prefix on* / *off* : toggle prefix for this group
• *prefix status* : check prefix status
• *prefix set <sym>* : set group prefix (e.g. \`prefix set !\`)
• *prefix reset* : reset to global default
• *prefix list* : show custom groups

_Global:_ add \`--global\` (e.g. \`prefix on --global\`, \`prefix add !\`, \`prefix del 1\`)`

/**
 * @param {PluginCtx} ctx
 * @returns {Promise<void>}
 */
async function run(ctx) {
    const { text, m, jid, pluginManager, isOwner } = ctx
    if (!isOwner) return

    let prefixManager = ctx.prefixManager
    // Hot-upgrade prefixManager if old instance is cached
    if (typeof prefixManager?.setGroupPrefixOn !== "function" || !prefixManager?._isFixedV2) {
        try {
            const freshModule = await import(`#manager/prefix-manager.js?t=${Date.now()}`)
            const fresh = freshModule.prefixManager
            for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(fresh))) {
                if (key !== "constructor" && typeof fresh[key] === "function") {
                    prefixManager[key] = fresh[key].bind(fresh)
                }
            }
            prefixManager._isFixedV2 = true
        } catch (e) {
            console.error("[prefix-manager] failed to hot-upgrade prefixManager:", e)
        }
    }

    const isGroup = Boolean(jid?.endsWith("@g.us"))

    if (!text) {
        return await m.arashirep(HELP_TEXT)
    }

    const params = text.split(/\s+/).filter(Boolean)
    const userAction = params[0]?.toLowerCase()
    const isGlobal = params.some(p => p === "--global" || p === "-g" || p === "global")
    const cleanParams = params.filter(p => p !== "--global" && p !== "-g" && p !== "global")
    const userFirstParam = cleanParams[1]

    // STATUS
    if (userAction === "status" || userAction === "s") {
        const globalStatus = prefixManager.getStatus()
        const gStatus = globalStatus.isPrefixActive ? "ON" : "OFF"
        const gList = globalStatus.prefixList.join(" , ")

        if (isGroup) {
            const groupStatus = prefixManager.getStatus(jid)
            const grpStatus = groupStatus.isPrefixActive ? "ON" : "OFF"
            const grpList = groupStatus.prefixList.join(" , ")
            const grpType = groupStatus.isCustom ? "Custom" : "Default"

            return await m.arashirep(
                `*Prefix Status*\n` +
                `• Group : *${grpStatus}* [ ${grpList} ] (${grpType})\n` +
                `• Global: *${gStatus}* [ ${gList} ]`
            )
        }

        const overrides = prefixManager.getAllGroupOverrides?.() || []
        return await m.arashirep(
            `*Prefix Status*\n` +
            `• Global: *${gStatus}* [ ${gList} ] (${overrides.length} custom groups)`
        )
    }

    // LIST OVERRIDES
    if (userAction === "list" || userAction === "l") {
        const overrides = prefixManager.getAllGroupOverrides?.() || []
        if (!overrides.length) {
            return await m.arashirep(`no custom group prefix configured`)
        }

        let out = `*Custom Prefix Groups (${overrides.length}):*\n`
        overrides.forEach((o, i) => {
            const st = o.isPrefixActive ? "ON" : "OFF"
            out += `${i + 1}. \`${o.jid}\` : *${st}* [ ${o.prefixList.join(" , ")} ]\n`
        })
        return await m.arashirep(out.trim())
    }

    // TOGGLE ON
    if (userAction === "on") {
        if (isGroup && !isGlobal) {
            const res = await prefixManager.setGroupPrefixOn(jid)
            return await m.arashirep(res.message)
        }
        const response = await prefixManager.togglePrefixOn()
        return await m.arashirep(`${response.message} (global)`)
    }

    // TOGGLE OFF
    if (userAction === "off") {
        if (isGroup && !isGlobal) {
            const res = await prefixManager.setGroupPrefixOff(jid)
            return await m.arashirep(res.message)
        }
        const response = await prefixManager.togglePrefixOff()
        return await m.arashirep(`${response.message} (global)`)
    }

    // RESET GROUP OVERRIDE
    if (userAction === "reset" || userAction === "r") {
        if (!isGroup) {
            return await m.arashirep(`*prefix reset* only works in groups`)
        }
        const res = await prefixManager.resetGroupPrefix(jid)
        return await m.arashirep(res.message)
    }

    // SET CUSTOM PREFIX FOR GROUP
    if (userAction === "set") {
        if (!isGroup) {
            return await m.arashirep(`*prefix set* only works in groups`)
        }
        const prefixes = cleanParams.slice(1)
        if (!prefixes.length) {
            return await m.arashirep(`usage: prefix set <symbol> (e.g. \`prefix set !\`)`)
        }
        const res = await prefixManager.setGroupPrefixList(jid, prefixes)
        return await m.arashirep(res.message)
    }

    // ADD GLOBAL
    if (userAction === "add" || userAction === "a") {
        if (!userFirstParam) {
            return await m.arashirep(`usage: prefix add <symbol>`)
        }
        const response = await prefixManager.addPrefix(userFirstParam)
        return await m.arashirep(response.message)
    }

    // RESET TO DEFAULT GLOBAL LIST
    if (userAction === "stdl") {
        const response = await prefixManager.setToDefaultPrefixList()
        return await m.arashirep(response.message)
    }

    // DELETE GLOBAL
    if (userAction === "del" || userAction === "d") {
        if (!userFirstParam) {
            return await m.arashirep(`usage: prefix del <index>`)
        }
        const response = await prefixManager.deletePrefix(Number(userFirstParam))
        return await m.arashirep(response.message)
    }

    // RESERVED
    if (userAction === "reserved") {
        const content = pluginManager.getBypassPluginString()
        return await m.arashirep(`*Reserved Prefixes:*\n\n${content}`)
    }

    return await m.arashirep(`unknown action. type *prefix* for help`)
}

/**@type {Plugin} */
const plugin = { run }

plugin.name = "prefix manager"
plugin.commands = ["prefix"]
plugin.categories = ["owner"]
plugin.description = `Manage global and per-group prefix.`

plugin.meta = {
    filename: "prefix-manager.js",
    author: "Kadokun x Arashi",
    note: "Multi-group prefix override backed by JSONL",
    version: "3.2.0",
    path: "owner"
}

plugin.config = {
    protected: true,
    bypassPrefix: true,
}

export default plugin
