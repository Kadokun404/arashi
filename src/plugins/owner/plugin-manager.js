import fs from "node:fs"
import path from "node:path"
import { jidDecode, areJidsSameUser } from "baileys"

const Action = {
    GET: 1,
    UNINSTALL: 2,
    INSTALL: 3,
    INSTALL_FORCE: 4,
    VIEW_PLUGIN_PROTECTED: 11,
    TRASH: 20,
    RESTORE: 21,
    EMPTY_TRASH: 22,
    CONFIRM_YES: 30,
    CONFIRM_NO: 31,
    FIND: 40,
    HIDDEN: 41
}

const actionMapping = {
    get: Action.GET,
    g: Action.GET,

    uninstall: Action.UNINSTALL,
    del: Action.UNINSTALL,
    u: Action.UNINSTALL,
    d: Action.UNINSTALL,
    rm: Action.UNINSTALL,

    install: Action.INSTALL,
    add: Action.INSTALL,
    i: Action.INSTALL,

    "-r": Action.INSTALL_FORCE,

    protected: Action.VIEW_PLUGIN_PROTECTED,
    p: Action.VIEW_PLUGIN_PROTECTED,

    trash: Action.TRASH,
    listtrash: Action.TRASH,
    t: Action.TRASH,

    restore: Action.RESTORE,
    undel: Action.RESTORE,
    r: Action.RESTORE,

    empty: Action.EMPTY_TRASH,
    emptytrash: Action.EMPTY_TRASH,
    cleartrash: Action.EMPTY_TRASH,

    y: Action.CONFIRM_YES,
    ya: Action.CONFIRM_YES,
    yes: Action.CONFIRM_YES,

    batal: Action.CONFIRM_NO,
    cancel: Action.CONFIRM_NO,

    // Find & Search (f & s)
    find: Action.FIND,
    search: Action.FIND,
    f: Action.FIND,
    s: Action.FIND,

    // Hidden (h)
    hidden: Action.HIDDEN,
    hide: Action.HIDDEN,
    h: Action.HIDDEN
}

const getPluginHandler = async (ctx, userParams) => {
    const { sock, jid, pluginManager, m, q } = ctx
    const { userCommand, userAdditionalParam } = userParams

    if (!userCommand) return await m.arashirep(`Specify the plugin command name.\nExample: .plugin g play`)

    const plugin = pluginManager.getPlugin(userCommand)
    if (!plugin) return await m.arashirep(`Plugin not found: ${userCommand}`)

    if (userAdditionalParam === "-t") {
        const pluginCode = await fs.promises.readFile(plugin.path, { encoding: 'utf-8' })
        return await sock.sendMessage(jid, { text: pluginCode }, { quoted: q })
    }

    let mentions = []
    let caption = `Plugin: ${plugin.name}\nAuthor: ${plugin.meta.author || "Unknown"}`

    if (q && !areJidsSameUser(m.sender, q?.sender)) {
        caption = `Shared plugin ${plugin.name} from @${jidDecode(m.sender).user}`
        mentions[0] = m.sender
    }

    return await sock.sendMessage(jid, {
        document: { url: plugin.path },
        fileName: plugin.meta.filename,
        mimetype: 'text/javascript',
        caption,
        mentions
    }, { quoted: q })
}

const uninstallPluginHandler = async (ctx, tokens) => {
    const { pluginManager, m, menuManager } = ctx

    // Cek flag force / instan: -y, --yes, -f, --force
    const isForce = tokens.some(t => /^(-y|--yes|-f|--force)$/i.test(t))
    const rawTargets = tokens.filter(t => !/^(-y|--yes|-f|--force)$/i.test(t))

    if (!rawTargets.length) {
        return await m.arashirep(`Specify plugin command names to delete.\nExample: .plugin d test1 test2 or .plugin d test1 -y`)
    }

    const toDelete = []
    const protectedList = []
    const notFoundList = []
    const seenPaths = new Set()

    for (const cmd of rawTargets) {
        const cleanCmd = cmd.trim().toLowerCase()
        if (!cleanCmd) continue

        const plugin = pluginManager.getPlugin(cleanCmd)
        if (!plugin) {
            if (!notFoundList.includes(cleanCmd)) notFoundList.push(cleanCmd)
            continue
        }

        if (plugin?.config?.protected) {
            if (!protectedList.includes(cleanCmd)) protectedList.push(cleanCmd)
            continue
        }

        if (!seenPaths.has(plugin.path)) {
            seenPaths.add(plugin.path)
            toDelete.push({ cmd: cleanCmd, plugin })
        }
    }

    if (toDelete.length === 0) {
        let msg = `No deletable plugins found.`
        if (protectedList.length) msg += `\nProtected: ${protectedList.join(', ')}`
        if (notFoundList.length) msg += `\nNot found: ${notFoundList.join(', ')}`
        return await m.arashirep(msg)
    }

    // 1 plugin & tanpa flag -y: langsung eksekusi ke Trash
    if (toDelete.length === 1 && !isForce) {
        const target = toDelete[0]
        const result = await pluginManager.deletePlugin(target.cmd)
        if (menuManager?.buildMenu) menuManager.buildMenu()

        let rep = result.message || `Plugin ${target.cmd} moved to trash.`
        if (protectedList.length) rep += `\n\nProtected (skipped): ${protectedList.join(', ')}`
        if (notFoundList.length) rep += `\nNot found: ${notFoundList.join(', ')}`
        return await m.arashirep(rep)
    }

    // Multi-plugin (> 1) dan TANPA flag -y: Mode Konfirmasi
    if (toDelete.length > 1 && !isForce) {
        pluginManager.setPendingConfirmation(m.sender, {
            targets: toDelete,
            protectedList,
            notFound: notFoundList,
            chatJid: ctx.jid
        })

        const previewList = toDelete.map((item, i) => `${i + 1}. *${item.plugin.commands[0]}* -> ${item.plugin.meta?.filename || path.basename(item.plugin.path)}`).join('\n')

        let msg = `Confirm Deletion (${toDelete.length} plugins):\n\n` +
            `${previewList}\n`
        if (protectedList.length) msg += `\nProtected (skipped): ${protectedList.join(', ')}`
        if (notFoundList.length) msg += `\nNot found: ${notFoundList.join(', ')}`
        msg += `\nReply with *Y* to confirm, or *cancel* to abort.\n(Expires in 60s. Use -y flag to bypass confirmation)`
        return await m.arashirep(msg)
    }

    // Pakai flag -y / force: Langsung eksekusi multi-delete ke Trash
    const successDeleted = []
    for (const item of toDelete) {
        const res = await pluginManager.deletePlugin(item.cmd)
        if (res.ok) successDeleted.push(item)
    }
    if (menuManager?.buildMenu) menuManager.buildMenu()

    let rep = `Moved ${successDeleted.length} plugins to trash:\n`
    rep += successDeleted.map(i => `• ${i.plugin.commands[0]} (${i.plugin.name})`).join('\n')
    if (protectedList.length) rep += `\n\nProtected (skipped): ${protectedList.join(', ')}`
    if (notFoundList.length) rep += `\nNot found: ${notFoundList.join(', ')}`
    rep += `\n\nType .plugin r <command> to restore.`
    return await m.arashirep(rep)
}

const trashListHandler = async (ctx) => {
    const { pluginManager, m } = ctx
    const trashList = await pluginManager.getTrashList()

    if (!trashList || !trashList.length) {
        return await m.arashirep(`Trash is empty.`)
    }

    const itemsText = trashList.map((item, idx) => {
        const dateStr = new Date(item.deletedAt).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
        return `${idx + 1}. *${item.name}*\n• Command: ${item.commands.join(', ')}\n• File: ${item.filename}\n• Deleted: ${dateStr}`
    }).join('\n\n')

    const rep = `Trash List (${trashList.length} plugins):\n\n` +
        `${itemsText}\n\n` +
        `*Commands:*\n` +
        `• .plugin r <command> (restore to bot)\n` +
        `• .plugin empty (delete permanently)`
    return await m.arashirep(rep)
}

const restorePluginHandler = async (ctx, userParams) => {
    const { pluginManager, m, menuManager } = ctx
    const { userCommand } = userParams

    if (!userCommand) {
        return await m.arashirep(`Specify the plugin command or filename to restore.\nExample: .plugin r play`)
    }

    const result = await pluginManager.restorePlugin(userCommand)
    if (result.ok && menuManager?.buildMenu) {
        menuManager.buildMenu()
    }
    return await m.arashirep(result.message)
}

const emptyTrashHandler = async (ctx) => {
    const { pluginManager, m } = ctx
    const count = await pluginManager.emptyTrash()

    if (!count) {
        return await m.arashirep(`Trash is already empty.`)
    }
    return await m.arashirep(`Emptied trash. ${count} plugins permanently deleted.`)
}

const findPluginHandler = async (ctx, tokens) => {
    const { m, pluginManager } = ctx
    const keyword = tokens.join(" ").trim()

    if (!keyword) {
        return await m.arashirep(
            `Specify a search keyword.\nExample: .plugin s tiktok`
        )
    }

    const q = keyword.toLowerCase()
    const matches = []

    for (const plugin of pluginManager.pluginArray) {
        const nameMatch = plugin.name?.toLowerCase().includes(q)
        const cmdMatch = plugin.commands?.some(c => c.toLowerCase().includes(q))
        const filename = plugin.meta?.filename || path.basename(plugin.path || "")
        const fileMatch = filename.toLowerCase().includes(q)
        const catMatch = plugin.categories?.some(c => c.toLowerCase().includes(q))
        const descMatch = plugin.description?.toLowerCase().includes(q)

        if (nameMatch || cmdMatch || fileMatch || catMatch || descMatch) {
            matches.push({
                plugin,
                filename
            })
        }
    }

    if (!matches.length) {
        return await m.arashirep(`No plugins found matching "${keyword}".`)
    }

    const MAX_SHOW = 15
    const showMatches = matches.slice(0, MAX_SHOW)

    const listText = showMatches.map((item, idx) => {
        const p = item.plugin
        const badges = []
        if (p.config?.protected) badges.push("protected")
        if (p.config?.hidden || p.hidden || p.categories?.includes("example")) badges.push("hidden")
        if (p.config?.bypassPrefix) badges.push("no-prefix")
        const badgeStr = badges.length ? ` [${badges.join(", ")}]` : ""

        return `${idx + 1}. *${p.name}*${badgeStr}\n` +
            `• Commands: ${p.commands.join(", ")}\n` +
            `• Category: ${p.categories.join(", ")}\n` +
            `• File: ${item.filename}`
    }).join("\n\n")

    let rep = `Search Results ("${keyword}") - ${matches.length} plugins${matches.length > MAX_SHOW ? ` (showing top ${MAX_SHOW})` : ''}:\n\n` +
        `${listText}\n\n` +
        `*Quick Actions:*\n` +
        `• .plugin g <command> (get source)\n` +
        `• .plugin d <command> (move to trash)`

    return await m.arashirep(rep)
}

const hiddenPluginHandler = async (ctx) => {
    const { m, pluginManager } = ctx
    const hiddenList = pluginManager.pluginArray.filter(
        p => p?.config?.hidden || p?.hidden || p?.categories?.includes("example")
    )

    if (!hiddenList.length) {
        return await m.arashirep(`No hidden plugins found.`)
    }

    const listText = hiddenList.map((p, idx) => {
        const filename = p.meta?.filename || path.basename(p.path || "")
        return `${idx + 1}. *${p.name}*\n` +
            `• Commands: ${p.commands.join(", ")}\n` +
            `• Category: ${p.categories.join(", ")}\n` +
            `• File: ${filename}`
    }).join("\n\n")

    const rep = `Hidden Plugins (${hiddenList.length} plugins):\n\n` +
        `${listText}`

    return await m.arashirep(rep)
}

const pluginInstallHandler = async (ctx, userParams) => {
    const { m, q, pluginManager, menuManager } = ctx
    const isReplacePlugin = userParams.userCommand === "-r"

    if (!q) return await m.arashirep(`Reply to a plugin js file or code snippet to install.`)

    if (q.content === "documentMessage") {
        const isValidMime = q?.message?.documentMessage?.mimetype === "text/javascript"
        if (!isValidMime) return await m.arashirep(`File mimetype must be text/javascript.`)
        const buffer = await q.download("buffer")
        const response = await pluginManager.install(buffer, isReplacePlugin)
        const { ok, message } = response
        if (ok) menuManager.buildMenu()
        return await m.arashirep(message)
    }

    if (q.content === "conversation" || q.content === "extendedTextMessage") {
        const buffer = Buffer.from(q.text)
        const response = await pluginManager.install(buffer, isReplacePlugin)
        const { ok, message } = response
        if (ok) menuManager.buildMenu()
        return await m.arashirep(message)
    }

    return await m.arashirep(`Reply to a js document or message containing plugin code.`)
}

async function run(ctx) {
    if (!ctx.isOwner) return
    const { text, m, command, pluginManager } = ctx

    // Support langsung command .addplugin / .installplugin
    if (command === "addplugin" || command === "installplugin") {
        const tokens = (text || "").split(/[\s,]+/).filter(Boolean)
        const isForce = tokens.includes("-r") || tokens.includes("-f")
        return await pluginInstallHandler(ctx, {
            userAction: isForce ? Action.INSTALL_FORCE : Action.INSTALL,
            userCommand: isForce ? "-r" : tokens[0],
            userAdditionalParam: tokens[1]
        })
    }

    if (!text) return m.arashirep(description)

    const tokens = text.split(/[\s,]+/).filter(Boolean)
    const actionKey = tokens[0]?.toLowerCase()
    const userAction = actionMapping[actionKey]

    const remainingTokens = tokens.slice(1)

    const userParams = {
        userAction,
        userCommand: remainingTokens[0],
        userAdditionalParam: remainingTokens[1]
    }

    if (userAction === Action.GET) {
        return await getPluginHandler(ctx, userParams)
    }

    if (userAction === Action.UNINSTALL) {
        return await uninstallPluginHandler(ctx, remainingTokens)
    }

    if (userAction === Action.INSTALL) {
        return await pluginInstallHandler(ctx, userParams)
    }

    if (userAction === Action.INSTALL_FORCE) {
        return await pluginInstallHandler(ctx, { ...userParams, userCommand: "-r" })
    }

    if (userAction === Action.VIEW_PLUGIN_PROTECTED) {
        const header = `Protected Plugins:\n\n`
        const result = pluginManager.getProtectedPluginString()
        return await m.arashirep(header + result)
    }

    if (userAction === Action.TRASH) {
        return await trashListHandler(ctx)
    }

    if (userAction === Action.RESTORE) {
        return await restorePluginHandler(ctx, userParams)
    }

    if (userAction === Action.EMPTY_TRASH) {
        return await emptyTrashHandler(ctx)
    }

    if (userAction === Action.FIND) {
        return await findPluginHandler(ctx, remainingTokens)
    }

    if (userAction === Action.HIDDEN) {
        return await hiddenPluginHandler(ctx)
    }

    if (userAction === Action.CONFIRM_YES) {
        const handled = await pluginManager.processConfirmation(ctx)
        if (!handled) {
            return await m.arashirep(`No pending plugin deletion confirmation.`)
        }
        return
    }

    if (userAction === Action.CONFIRM_NO) {
        if (pluginManager.hasPendingConfirmation(m.sender)) {
            pluginManager.clearPendingConfirmation(m.sender)
            return await m.arashirep(`Plugin deletion cancelled.`)
        }
        return await m.arashirep(`No pending plugin deletion confirmation.`)
    }

    return await m.arashirep(`Unrecognized command. Type .plugin for usage.`)
}

const description = `Manage bot plugins: install, delete, restore, search, and view status.\n\n` +
    `*Usage:*\n` +
    `• .plugin s <query> (search plugin by name/command/file)\n` +
    `• .plugin g <command> [-t] (get plugin file or raw code with -t)\n` +
    `• .plugin i (reply to a js file or code snippet to install)\n` +
    `• .plugin d <command...> [-y] (delete plugin to trash)\n` +
    `• .plugin t (list plugins in trash)\n` +
    `• .plugin r <command> (restore plugin from trash)\n` +
    `• .plugin empty (empty trash permanently)\n` +
    `• .plugin p (view protected plugins)\n` +
    `• .plugin h (view hidden plugins)\n\n` +
    `*Example:*\n` +
    `• .plugin s tiktok\n` +
    `• .plugin g play -t\n` +
    `• .plugin d test -y`

const plugin = {
    run,
    name: "plugin manager",
    commands: ["plugin", "plugins", "addplugin", "installplugin"],
    categories: ["owner"],
    description
}

plugin.meta = {
    filename: "plugin-manager.js",
    author: "kado",
    note: "v2.1.0: multi-delete, trash/restore, find/search (f/s), hidden filter (h), shortcut 1 huruf",
    path: "owner/plugin",
    version: "2.1.0"
}

plugin.config = {
    protected: true,
    bypassPrefix: true
}

export default plugin
