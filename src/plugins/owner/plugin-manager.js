import fs from "node:fs"
import { jidDecode, areJidsSameUser } from "baileys"

const Action = {
    GET: 1,
    UNINSTALL: 2,
    INSTALL: 3,
    INSTALL_FORCE: 4,
    VIEW_PLUGIN_PROTECTED: 11
}

const actionMapping = {
    get: Action.GET,
    g: Action.GET,

    uninstall: Action.UNINSTALL,
    del: Action.UNINSTALL,
    u: Action.UNINSTALL,

    install: Action.INSTALL,
    add: Action.INSTALL,
    i: Action.INSTALL,

    "-r": Action.INSTALL_FORCE,

    protected: Action.VIEW_PLUGIN_PROTECTED
}

const getPluginHandler = async (ctx, userParams) => {
    const { sock, jid, pluginManager, m, q } = ctx
    const { userCommand, userAdditionalParam } = userParams

    if (!userCommand) return await m.arashirep(`command nya apa sayang?`)

    const plugin = pluginManager.getPlugin(userCommand)
    if (!plugin) return await m.arashirep(`plugin ${userCommand} gak ketemu`)

    if (userAdditionalParam === "-t") {
        const pluginCode = await fs.promises.readFile(plugin.path, { encoding: 'utf-8' })
        return await sock.sendMessage(jid, { text: pluginCode }, { quoted: q })
    }

    let mentions = []
    let caption = `nih plugin ${plugin.name} nya\nplugin di buat oleh ${plugin.meta.author || '(author kosong)'}`

    if (q && !areJidsSameUser(m.sender, q?.sender)) {
        caption = `kamu di kasih plugin ${plugin.name} sama @${jidDecode(m.sender).user}, happy coding yaa`
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

const uninstallPluginHandler = async (ctx, userParams) => {
    const { pluginManager, m } = ctx
    const { userCommand } = userParams
    const result = await pluginManager.deletePlugin(userCommand)
    ctx.menuManager.buildMenu()
    return await m.arashirep(result.message || `sudah aku proses`)
}

const pluginInstallHandler = async (ctx, userParams) => {
    const { m, q, pluginManager, menuManager } = ctx
    const isReplacePlugin = userParams.userCommand === "-r"

    if (!q) return await m.arashirep(`reply pesan plugin nya dulu yaa`)

    if (q.content === "documentMessage") {
        const isValidMime = q?.message?.documentMessage?.mimetype === "text/javascript"
        if (!isValidMime) return await m.arashirep(`mime type file nya bukan javascript sayang`)
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

    return await m.arashirep(`reply nya musti dokumen js atau text code plugin nya yaa`)
}

async function run(ctx) {
    if (!ctx.isOwner) return
    const { text, m, pluginManager } = ctx
    if (!text) return m.arashirep('haloo, ini plugin manager, mau ngapain sayang?')

    const param = text.split(/\s+/).filter(Boolean)
    const userAction = actionMapping[param[0]]

    const userParams = {
        userAction,
        userCommand: param[1],
        userAdditionalParam: param[2]
    }

    if (userAction === Action.GET) {
        return await getPluginHandler(ctx, userParams)
    }

    if (userAction === Action.UNINSTALL) {
        return await uninstallPluginHandler(ctx, userParams)
    }

    if (userAction === Action.INSTALL) {
        return await pluginInstallHandler(ctx, userParams)
    }

    if (userAction === Action.INSTALL_FORCE) {
        return await pluginInstallHandler(ctx, { ...userParams, userCommand: "-r" })
    }

    if (userAction === Action.VIEW_PLUGIN_PROTECTED) {
        const header = `ini daftar plugin protected nya sayang\n\n`
        const result = pluginManager.getProtectedPluginString()
        return await m.arashirep(header + result)
    }

    return await m.arashirep(`aku gak ngerti maksudnya, coba pake -h yaa`)
}

const description = `haloo sayangg, ini plugin manager, aku jelasin caranya yaa\n\n` +
    `install [ i, add, buat nambahin plugin baru, kalau mau ganti/replace plugin yang udah ada tinggal tambahin -r di belakang, contoh: plugin add -r, atau langsung ketik -r ]\n` +
    `uninstall [ u, del, buat hapus plugin, tinggal kasih command nya ]\n` +
    `get [ g, buat ambil code plugin nya, kasih command nya, tambahin -t kalau mau di kirim sebagai text ]\n` +
    `protected [ liat daftar plugin yang protected ]`

const plugin = {
    run,
    name: "plugin manager",
    commands: ["plugin"],
    categories: ["owner"],
    description
}

plugin.meta = {
    filename: "plugin-manager.js",
    author: "kado",
    note: "restart bot kalau udah kebanyakan install/uninstall plugin",
    path: "owner",
    version: "1"
}

plugin.config = {
    protected: true,
    bypassPrefix: true
}

export default plugin