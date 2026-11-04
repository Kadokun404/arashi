import fs from "node:fs"
import { allPaths } from "#core/all-paths.js"
import { pathToFileURL } from "node:url"
import path from "node:path"
import { pluginManagerLock } from "#core/async-lock.js"
import { randomUUID } from "node:crypto"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { pluginVerifikator } from "#core/plugin-verifikator.js"

const ASYNC_LOCK_KEY = "wakwau"


/**
 * @typedef {object} managerResponse
 * @property {boolean} ok
 * @property {string|undefined} message
 */

/**
 * 
 * @param {string} message pesan error
 */
const fail = (message) => ({
    ok: false,
    message
})

const success = (message) => ({
    ok: true,
    message
})

/**
 * @import {Plugin, PluginCtx, CommonResponse, PluginVerifikatorResponse} from "../types/types.js"
 */

class PluginManager {
    /**@type {Map<string, Plugin>} */
    pluginMap = new Map()


    /**@type {Array<Plugin>} */
    pluginArray = []

    async init() {
    this.pluginMap.clear()
    this.pluginArray.length = 0

    const now = Date.now()
    const files = await fs.promises.readdir(allPaths.plugins, {
        recursive: true
    })

    console.log(`[PLUGIN] ditemukan ${files.length} file`)

    for (const file of files) {
        if (!file.endsWith(".js")) continue

        const filePath = path.join(allPaths.plugins, file)
        const filePathUrl = pathToFileURL(filePath).href + "?time=" + now

        console.log(`[PLUGIN] loading ${file}`)

        try {
            const plugin = await import(filePathUrl)

            if (!plugin.default) {
                console.warn(`[PLUGIN] ${file} tidak memiliki export default`)
                continue
            }

            plugin.default.path = filePath

            this.pluginArray.push(plugin.default)

            console.log(`[PLUGIN] loaded ${file}`)
        } catch (err) {
            console.error(`[PLUGIN] gagal load ${file}`)
            console.error(err)
        }
    }

    console.log(`[PLUGIN] menyusun command map...`)

    for (const plugin of this.pluginArray) {
        if (!Array.isArray(plugin.commands)) {
            console.warn(
                `[PLUGIN] ${plugin.name ?? plugin.path} tidak memiliki commands`
            )
            continue
        }

        for (const command of plugin.commands) {
            this.pluginMap.set(command, plugin)
        }
    }

    console.log(
        `[PLUGIN] selesai. ${this.pluginArray.length} plugin, ${this.pluginMap.size} command`
    )
}

    /**
     * 
     * @param {Buffer} buffer 
     * @param {Boolean} isReplaceInstall 
     * @returns {CommonResponse}
     */
    async install(buffer, isReplaceInstall) {
        return await pluginManagerLock.withLock(ASYNC_LOCK_KEY, async () => {

            const TEMP_PLUGIN_PATH = path.join(allPaths.temp, randomUUID() + '.js')

            try {
                const parrentDir = dirname(TEMP_PLUGIN_PATH)
                await mkdir(parrentDir, {
                    recursive: true
                })
                await writeFile(TEMP_PLUGIN_PATH, buffer)
                console.log(`[file created] ${TEMP_PLUGIN_PATH}`)
                const module = await import(pathToFileURL(TEMP_PLUGIN_PATH))
                const response = pluginVerifikator(module, isReplaceInstall)

                // tentuin folder tujuan dari plugin.meta.path (di isi sendiri di kode plugin nya)
                // contoh meta.path: "owner" -> plugin di taro di plugins/owner/<filename>
                // kalau meta.path gak di isi, plugin di taro di root folder plugins/ (perilaku lama)
                const pluginCategoryPath = module?.default?.meta?.path
                const targetDir = pluginCategoryPath
                    ? path.join(allPaths.plugins, pluginCategoryPath)
                    : allPaths.plugins

                if (response.status === "install") {
                    /**@type {Plugin} */
                    const newPlugin = module.default
                    newPlugin.path = path.join(targetDir, newPlugin.meta.filename)

                    // bikin folder kategori dulu kalau belum ada (misal plugins/owner)
                    await mkdir(targetDir, { recursive: true })

                    // copy file plugin ke direktory plugin
                    console.log(newPlugin.path)
                    await writeFile(newPlugin.path, buffer)

                    // tambah plugin ke array
                    this.pluginArray.push(newPlugin)

                    // tambah command plugin ke map
                    for (const cmd of newPlugin.commands) {
                        this.pluginMap.set(cmd, newPlugin)
                    }

                    /**@type {CommonResponse} */
                    const finalResponse = {
                        ok: true,
                        message: response.message
                    }
                    return finalResponse
                }

                else if (response.status === "replace") {

                    /**@type {Plugin} */
                    const newPlugin = module.default
                    newPlugin.path = path.join(targetDir, newPlugin.meta.filename)

                    // delete plugin
                    for (const cmd of newPlugin.commands){
                        await this.deletePlugin(cmd)
                    }

                    // bikin folder kategori dulu kalau belum ada (misal plugins/owner)
                    await mkdir(targetDir, { recursive: true })

                    // copy file plugin ke direktory plugin
                    console.log(newPlugin.path)
                    await writeFile(newPlugin.path, buffer)

                    // tambah plugin ke array
                    this.pluginArray.push(newPlugin)

                    // tambah command plugin ke map
                    for (const cmd of newPlugin.commands) {
                        this.pluginMap.set(cmd, newPlugin)
                    }

                    /**@type {CommonResponse} */
                    const finalResponse = {
                        ok: true,
                        message: response.message
                    }
                    return finalResponse
                }

                else if (response.status === "fail") {
                    /**@type {CommonResponse} */
                    const finalResponse = {
                        ok: false,
                        message: response.message
                    }
                    return finalResponse
                }




            } catch (e) {
                console.error(e)
                return {
                    status: "fail",
                    message: e.message
                }
            } finally {
                await rm(TEMP_PLUGIN_PATH)
                console.log(`[file removed] ${TEMP_PLUGIN_PATH}`)
            }




        })
    }


    /**
     * 
     * @param {string} command 
     * @returns {Promise <managerResponse>}
     */
    async deletePlugin(command) {
        try {
            if (!command) return fail(`😮‍💨 mau hapus plugin apa sayang? kasih dong command nya...`)

            // cek plugin ada apa engga
            const plugin = this.pluginMap.get(command)

            if (!plugin) return fail(`👻 wakwau.. kamu gak punya plugin dengan command *${command}*`)

            // cek apakah plugin protected
            if (plugin?.config?.protected) return fail(`hell nah.. how about no.. plugin *${plugin.name}* adalah plugin protected. kamu bisa melihat semua plugin protected denagn command --protected`)

            // hapus file dari folder plugin
            await fs.promises.rm(plugin.path)

            // hapus plugin dari map
            for (const cmd of plugin.commands) {
                this.pluginMap.delete(cmd)
            }

            // hapus plugin dari array
            const pluginIndex = this.pluginArray.findIndex(p => {
                return p.commands.some(cmd => cmd === command)
            })
            this.pluginArray.splice(pluginIndex, 1)

            // susun kata kata dulu dong
            const kataKata = `*✅ plugin berhasil di uninstall*\n` +
                `nama: ${plugin.name}\n` +
                `command: ${plugin.commands.join(', ')}\n` +
                `path: ${plugin.path}`
            return success(kataKata)

        } catch (e) {
            console.error(`gagal hapus plugin`, e)
            return fail('error: ' + e.message)
        }
    }

    /**
     * @param {string} command plugin command
     * @returns {Plugin | undefined}
     */
    getPlugin(command) {
        if (!command) return undefined
        return this.pluginMap.get(command)
    }

    /**
     * fungsi yang mengembalikan string yang berisi info plugin protected
     * @returns {string} list plugin protected
     */
    getProtectedPluginString() {
        return this.pluginArray
            .filter(plugin => plugin?.config?.protected)
            .map(plugin => {
                const name = plugin.name
                const cmds = plugin.commands.join(', ')
                return `${cmds} (${name})`
            }).sort().join("\n")
    }

    /**
     * fungsi yang mengembalikan string yang berisi info plugin protected
     * @returns {string} list plugin protected
     */
    getBypassPluginString() {
        return this.pluginArray
            .filter(plugin => plugin?.config?.bypassPrefix)
            .map(plugin => {
                const name = plugin.name
                const cmds = plugin.commands.join(', ')
                return `${cmds} (${name})`
            }).sort().join("\n")
    }
}

const pluginManager = new PluginManager()
await pluginManager.init()

export { pluginManager }