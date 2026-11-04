/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { allPaths } from "#root/src/all-paths.js"

async function findPluginFile(query) {
    const q = query.trim().replace(/^\/+/, "")
    const withJs = q.endsWith(".js") ? q : `${q}.js`

    const directPath = path.join(allPaths.plugins, withJs)
    if (fs.existsSync(directPath)) return directPath

    const files = await fs.promises.readdir(allPaths.plugins, { recursive: true })
    const lowerWithJs = withJs.toLowerCase()
    const lowerQ = q.toLowerCase()

    for (const f of files) {
        if (!f.endsWith(".js")) continue
        const base = path.basename(f).toLowerCase()
        if (f.toLowerCase() === lowerWithJs || base === lowerWithJs || base.replace(/\.js$/, "") === lowerQ) {
            return path.join(allPaths.plugins, f)
        }
    }
    return null
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return
    const { m, text, pluginManager, menuManager } = ctx
    const target = (text || "").trim()
    const start = Date.now()

    try {
        if (!target) {
            await pluginManager.init()
            menuManager.buildMenu()
            const elapsed = Date.now() - start

            return await m.arashirep(
                `✅ *berhasil refresh semua plugin* (${elapsed} ms)\n` +
                `• total plugin : ${pluginManager.pluginArray.length}\n` +
                `• total command: ${pluginManager.pluginMap.size}`
            )
        }

        const existing =
            pluginManager.getPlugin(target) ||
            pluginManager.pluginArray.find(
                p =>
                    p?.meta?.filename?.toLowerCase() === target.toLowerCase() ||
                    p?.meta?.filename?.toLowerCase() === `${target.toLowerCase()}.js` ||
                    p?.name?.toLowerCase() === target.toLowerCase()
            )

        const filePath = existing?.path || (await findPluginFile(target))
        if (!filePath || !fs.existsSync(filePath)) {
            return await m.arashirep(`❌ plugin atau file *${target}* tidak ditemukan`)
        }

        const fileUrl = `${pathToFileURL(filePath).href}?time=${Date.now()}`
        const mod = await import(fileUrl)

        if (!mod?.default) {
            return await m.arashirep(`❌ file *${path.basename(filePath)}* tidak memiliki export default`)
        }

        const freshPlugin = mod.default
        freshPlugin.path = filePath

        const oldIdx = pluginManager.pluginArray.findIndex(
            p => p.path === filePath || (p?.meta?.filename && p.meta.filename === freshPlugin?.meta?.filename)
        )

        if (oldIdx !== -1) {
            const oldPlugin = pluginManager.pluginArray[oldIdx]
            for (const cmd of oldPlugin.commands || []) {
                pluginManager.pluginMap.delete(cmd)
            }
            pluginManager.pluginArray.splice(oldIdx, 1, freshPlugin)
        } else {
            pluginManager.pluginArray.push(freshPlugin)
        }

        for (const cmd of freshPlugin.commands || []) {
            pluginManager.pluginMap.set(cmd, freshPlugin)
        }

        menuManager.buildMenu()
        const elapsed = Date.now() - start
        const relPath = path.relative(allPaths.plugins, filePath)

        return await m.arashirep(
            `✅ *berhasil reload plugin* (${elapsed} ms)\n` +
            `• nama   : ${freshPlugin.name || "-"}\n` +
            `• file   : ${relPath}\n` +
            `• command: ${(freshPlugin.commands || []).join(", ")}`
        )
    } catch (e) {
        return await m.arashirep(`❌ gagal reload: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "reload plugin",
    commands: ["r", "reload", "refresh"],
    categories: ["owner"],
    description: "refresh / reload semua plugin atau satu plugin spesifik tanpa restart bot"
}

plugin.config = {
    protected: true,
    bypassPrefix: true
}

plugin.meta = {
    filename: "reload.js",
    version: "1.0.0",
    author: "Kado",
    note: "ketik r untuk reload semua plugin, atau r <command/nama_file> untuk reload 1 plugin",
    path: "owner"
}

export default plugin
