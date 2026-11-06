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

const uninstallPluginHandler = async (ctx, tokens) => {
    const { pluginManager, m, menuManager } = ctx

    // Cek flag force / instan: -y, --yes, -f, --force
    const isForce = tokens.some(t => /^(-y|--yes|-f|--force)$/i.test(t))
    const rawTargets = tokens.filter(t => !/^(-y|--yes|-f|--force)$/i.test(t))

    if (!rawTargets.length) {
        return await m.arashirep(`😮‍💨 Mau hapus plugin apa sayang? Kasih command nya yaa...\nContoh: *plugin del test1 test2* atau *plugin d test1 -y*`)
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
        let msg = `⚠️ *Tidak ada plugin yang dapat dihapus.*`
        if (protectedList.length) msg += `\n🛡️ *Protected (Dilarang):* ${protectedList.join(', ')}`
        if (notFoundList.length) msg += `\n❓ *Tidak Ditemukan:* ${notFoundList.join(', ')}`
        return await m.arashirep(msg)
    }

    // 1 plugin & tanpa flag -y: langsung eksekusi ke Trash (sesuai alur agar cepat)
    if (toDelete.length === 1 && !isForce) {
        const target = toDelete[0]
        const result = await pluginManager.deletePlugin(target.cmd)
        if (menuManager?.buildMenu) menuManager.buildMenu()

        let rep = result.message || `Plugin ${target.cmd} berhasil dipindahkan ke Trash.`
        if (protectedList.length) rep += `\n\n🛡️ *Protected (Dilewati):* ${protectedList.join(', ')}`
        if (notFoundList.length) rep += `\n❓ *Tidak Ditemukan:* ${notFoundList.join(', ')}`
        return await m.arashirep(rep)
    }

    // Multi-plugin (> 1) dan TANPA flag -y: Mode Konfirmasi & Preview
    if (toDelete.length > 1 && !isForce) {
        pluginManager.setPendingConfirmation(m.sender, {
            targets: toDelete,
            protectedList,
            notFound: notFoundList,
            chatJid: ctx.jid
        })

        const previewList = toDelete.map((item, i) => `${i + 1}. *${item.plugin.commands[0]}* ➔ \`${item.plugin.meta?.filename || path.basename(item.plugin.path)}\``).join('\n')

        let msg = `⚠️ *KONFIRMASI MULTI-DELETE PLUGIN*\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `Ditemukan *${toDelete.length} plugin* yang akan dipindahkan ke Trash:\n` +
            `${previewList}\n`
        if (protectedList.length) msg += `\n🛡️ *Protected (Dilewati):* ${protectedList.join(', ')}`
        if (notFoundList.length) msg += `\n❓ *Tidak Ditemukan:* ${notFoundList.join(', ')}`
        msg += `\n━━━━━━━━━━━━━━━━\n` +
            `Balas *Y* untuk lanjut hapus ke Trash, atau *batal* untuk batalkan.\n` +
            `_(Kadaluarsa dalam 60 detik. Gunakan akhiran *-y* untuk hapus langsung tanpa konfirmasi)_`
        return await m.arashirep(msg)
    }

    // Pakai flag -y / force: Langsung eksekusi multi-delete ke Trash
    const successDeleted = []
    for (const item of toDelete) {
        const res = await pluginManager.deletePlugin(item.cmd)
        if (res.ok) successDeleted.push(item)
    }
    if (menuManager?.buildMenu) menuManager.buildMenu()

    let rep = `🗑️ *HASIL HAPUS PLUGIN*\n━━━━━━━━━━━━━━━━\n`
    rep += `✅ Berhasil dipindahkan ke Trash (${successDeleted.length}):\n`
    rep += successDeleted.map(i => `• *${i.plugin.commands[0]}* (${i.plugin.name})`).join('\n')
    if (protectedList.length) rep += `\n\n🛡️ *Protected (Dilewati):* ${protectedList.join(', ')}`
    if (notFoundList.length) rep += `\n❓ *Tidak Ditemukan:* ${notFoundList.join(', ')}`
    rep += `\n━━━━━━━━━━━━━━━━\n💡 _Ketik *plugin restore <nama>* untuk mengembalikan._`
    return await m.arashirep(rep)
}

const trashListHandler = async (ctx) => {
    const { pluginManager, m } = ctx
    const trashList = await pluginManager.getTrashList()

    if (!trashList || !trashList.length) {
        return await m.arashirep(`🗑️ *Recycle Bin (Trash) Kosong*\nBelum ada plugin yang tersimpan di Trash.`)
    }

    const itemsText = trashList.map((item, idx) => {
        const dateStr = new Date(item.deletedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        return `${idx + 1}. *${item.name}*\n   • Command: ${item.commands.join(', ')}\n   • File: \`${item.filename}\`\n   • Dihapus: ${dateStr}`
    }).join('\n\n')

    const rep = `🗑️ *DAFTAR TRASH PLUGIN*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `Total: *${trashList.length} plugin*\n\n` +
        `${itemsText}\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `💡 *Menu Trash:*\n` +
        `• *plugin restore <nama/command>* ➔ Restore ke bot\n` +
        `• *plugin empty* ➔ Kosongkan Trash (hapus permanen)`
    return await m.arashirep(rep)
}

const restorePluginHandler = async (ctx, userParams) => {
    const { pluginManager, m, menuManager } = ctx
    const { userCommand } = userParams

    if (!userCommand) {
        return await m.arashirep(`Mau restore plugin apa sayang? Kasih nama command atau filenya yaa...\nContoh: *plugin restore tiktok* atau *plugin r test1*`)
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
        return await m.arashirep(`🗑️ Trash sudah kosong kok sayang.`)
    }
    return await m.arashirep(`🗑️ *Trash Dibersihkan!*\nSebanyak *${count} plugin* telah dihapus secara permanen.`)
}

const findPluginHandler = async (ctx, tokens) => {
    const { m, pluginManager } = ctx
    const keyword = tokens.join(" ").trim()

    if (!keyword) {
        return await m.arashirep(
            `🔍 Mau cari plugin apa sayang?\n` +
            `Contoh: *plugin f brat* atau *plugin s tiktok*`
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
        return await m.arashirep(`🔍 *Hasil Pencarian:*\nTidak ditemukan plugin dengan kata kunci *"${keyword}"*.`)
    }

    const MAX_SHOW = 15
    const showMatches = matches.slice(0, MAX_SHOW)

    const listText = showMatches.map((item, idx) => {
        const p = item.plugin
        const badges = []
        if (p.config?.protected) badges.push("🛡️ protected")
        if (p.config?.hidden || p.hidden || p.categories?.includes("example")) badges.push("👁️ hidden")
        if (p.config?.bypassPrefix) badges.push("⚡ no-prefix")
        const badgeStr = badges.length ? ` [${badges.join(", ")}]` : ""

        return `${idx + 1}. *${p.name}*${badgeStr}\n` +
            `   • Command: ${p.commands.join(", ")}\n` +
            `   • Kategori: ${p.categories.join(", ")}\n` +
            `   • File: \`${item.filename}\``
    }).join("\n\n")

    let rep = `🔍 *HASIL PENCARIAN PLUGIN* ("${keyword}")\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `Ditemukan *${matches.length} plugin*${matches.length > MAX_SHOW ? ` (menampilkan ${MAX_SHOW} teratas)` : ''}:\n\n` +
        `${listText}\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `💡 *Tips Shortcut:*\n` +
        `• *plugin g <cmd>* ➔ Ambil source code\n` +
        `• *plugin d <cmd>* ➔ Hapus ke Trash`

    return await m.arashirep(rep)
}

const hiddenPluginHandler = async (ctx) => {
    const { m, pluginManager } = ctx
    const hiddenList = pluginManager.pluginArray.filter(
        p => p?.config?.hidden || p?.hidden || p?.categories?.includes("example")
    )

    if (!hiddenList.length) {
        return await m.arashirep(`👁️ *Plugin Hidden Kosong*\nTidak ada plugin yang disembunyikan dari menu publik.`)
    }

    const listText = hiddenList.map((p, idx) => {
        const filename = p.meta?.filename || path.basename(p.path || "")
        return `${idx + 1}. *${p.name}*\n` +
            `   • Command: ${p.commands.join(", ")}\n` +
            `   • Kategori: ${p.categories.join(", ")}\n` +
            `   • File: \`${filename}\``
    }).join("\n\n")

    const rep = `👁️ *DAFTAR PLUGIN HIDDEN*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `Total: *${hiddenList.length} plugin* (tidak muncul di menu publik):\n\n` +
        `${listText}\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `💡 *Tips:* Tambahkan properti \`config: { hidden: true }\` pada plugin untuk menyembunyikannya dari menu publik.`

    return await m.arashirep(rep)
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
        const header = `ini daftar plugin protected nya sayang\n\n`
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
            return await m.arashirep(`Tidak ada konfirmasi penghapusan plugin yang sedang aktif.`)
        }
        return
    }

    if (userAction === Action.CONFIRM_NO) {
        if (pluginManager.hasPendingConfirmation(m.sender)) {
            pluginManager.clearPendingConfirmation(m.sender)
            return await m.arashirep(`❌ *Penghapusan plugin dibatalkan.*`)
        }
        return await m.arashirep(`Tidak ada konfirmasi penghapusan plugin yang sedang aktif.`)
    }

    return await m.arashirep(`aku gak ngerti maksudnya, coba ketik *plugin -h* yaa`)
}

const description = `haloo sayangg, ini plugin manager (v2.1.0), aku jelasin shortcut & caranya yaa\n\n` +
    `• f / s [ find / search, cari plugin. Contoh: plugin f brat, plugin s tiktok ]\n` +
    `• h [ hidden, intip daftar plugin yang disembunyikan dari menu publik ]\n` +
    `• d / u [ del / uninstall, hapus plugin ke Trash (multi/single). Contoh: plugin d test1 test2 ]\n` +
    `• t [ trash, liat isi tempat sampah / Recycle Bin ]\n` +
    `• r [ restore, kembalikan plugin dari Trash. Contoh: plugin r test1 ]\n` +
    `• empty [ kosongkan Recycle Bin secara permanen ]\n` +
    `• g [ get, ambil source code plugin, tambah -t untuk teks ]\n` +
    `• i [ install / add, reply file js atau teks code ]\n` +
    `• p [ protected, liat daftar plugin protected ]`

const plugin = {
    run,
    name: "plugin manager",
    commands: ["plugin", "plugins"],
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
