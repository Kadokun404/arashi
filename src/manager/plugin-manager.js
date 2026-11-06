import fs from "node:fs"
import { allPaths } from "#core/all-paths.js"
import { pathToFileURL } from "node:url"
import path from "node:path"
import { pluginManagerLock } from "#core/async-lock.js"
import { randomUUID } from "node:crypto"
import { mkdir, rm, writeFile, readFile, copyFile } from "node:fs/promises"
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


    /**@type {Map<string, object>} */
    pendingConfirmations = new Map()

    /**
     * Set pending confirmation session
     */
    setPendingConfirmation(sender, data) {
        if (!sender) return
        this.pendingConfirmations.set(sender, {
            ...data,
            expiresAt: Date.now() + 60000
        })
    }

    /**
     * Ambil sesi pending confirmation (auto clear jika expired)
     */
    getPendingConfirmation(sender) {
        if (!sender) return null
        const session = this.pendingConfirmations.get(sender)
        if (!session) return null
        if (Date.now() > session.expiresAt) {
            this.pendingConfirmations.delete(sender)
            return null
        }
        return session
    }

    /**
     * Hapus sesi pending confirmation
     */
    clearPendingConfirmation(sender) {
        if (sender) this.pendingConfirmations.delete(sender)
    }

    /**
     * Cek apakah ada pending confirmation aktif
     */
    hasPendingConfirmation(sender) {
        return Boolean(this.getPendingConfirmation(sender))
    }

    /**
     * Proses balasan konfirmasi (Y / Batal)
     */
    async processConfirmation(ctx) {
        const { m, menuManager } = ctx
        const sender = m.sender
        const session = this.getPendingConfirmation(sender)
        if (!session) return false

        const rawText = (m.text || '').trim().toLowerCase()
        const isYes = ['y', 'ya', 'yes', 'ok', 'iya', 'lanjut', 'gas', 'lanjutkan'].includes(rawText)
        const isNo = ['batal', 'cancel', 'ga', 'gak', 'ngga', 'nggak', 'no', 'tidak'].includes(rawText)

        if (isYes) {
            this.clearPendingConfirmation(sender)
            const successDeleted = []
            for (const item of session.targets) {
                const res = await this.deletePlugin(item.cmd)
                if (res.ok) successDeleted.push(item)
            }
            if (menuManager?.buildMenu) menuManager.buildMenu()

            let rep = `🗑️ *HASIL MULTI-DELETE PLUGIN*\n━━━━━━━━━━━━━━━━\n`
            rep += `✅ Berhasil dipindahkan ke Trash (${successDeleted.length}):\n`
            rep += successDeleted.map(i => `• *${i.plugin.commands[0]}* (${i.plugin.name})`).join('\n')
            if (session.protectedList?.length) rep += `\n\n🛡️ *Protected (Dilewati):* ${session.protectedList.join(', ')}`
            if (session.notFound?.length) rep += `\n❓ *Tidak Ditemukan:* ${session.notFound.join(', ')}`
            rep += `\n━━━━━━━━━━━━━━━━\n💡 _Gunakan *plugin restore <nama>* untuk mengembalikan jika diperlukan._`

            await m.arashirep(rep)
            return true
        }

        if (isNo) {
            this.clearPendingConfirmation(sender)
            await m.arashirep('❌ *Penghapusan plugin dibatalkan.*')
            return true
        }

        return false
    }

    /**
     * Baca metadata trash
     * @returns {Promise<Array<object>>}
     */
    async _readTrashMeta() {
        try {
            if (!fs.existsSync(allPaths.trashMeta)) return []
            const data = await fs.promises.readFile(allPaths.trashMeta, 'utf-8')
            const parsed = JSON.parse(data)
            return Array.isArray(parsed) ? parsed : []
        } catch (e) {
            console.error('[PLUGIN TRASH] Gagal baca trash metadata:', e)
            return []
        }
    }

    /**
     * Tulis metadata trash
     * @param {Array<object>} list 
     */
    async _writeTrashMeta(list) {
        try {
            await mkdir(dirname(allPaths.trashMeta), { recursive: true })
            await writeFile(allPaths.trashMeta, JSON.stringify(list, null, 2), 'utf-8')
        } catch (e) {
            console.error('[PLUGIN TRASH] Gagal simpan trash metadata:', e)
        }
    }

    /**
     * Ambil list plugin di trash
     */
    async getTrashList() {
        return await this._readTrashMeta()
    }

    /**
     * 
     * @param {string} command 
     * @param {object} [options]
     * @param {boolean} [options.hard=false]
     * @returns {Promise <managerResponse>}
     */
    async deletePlugin(command, { hard = false } = {}) {
        try {
            if (!command) return fail(`😮‍💨 mau hapus plugin apa sayang? kasih dong command nya...`)

            // cek plugin ada apa engga
            const plugin = this.pluginMap.get(command)

            if (!plugin) return fail(`👻 wakwau.. kamu gak punya plugin dengan command *${command}*`)

            // cek apakah plugin protected
            if (plugin?.config?.protected) return fail(`hell nah.. how about no.. plugin *${plugin.name}* adalah plugin protected. kamu bisa melihat semua plugin protected dengan command --protected`)

            if (hard) {
                // hapus permanen
                await fs.promises.rm(plugin.path)
            } else {
                // soft-delete ke trash
                await mkdir(allPaths.trashDir, { recursive: true })
                const baseName = plugin.meta?.filename || path.basename(plugin.path)
                const trashFileName = `${Date.now()}_${baseName}`
                const trashFilePath = path.join(allPaths.trashDir, trashFileName)

                // copy ke trash dulu baru rm file asli
                await fs.promises.copyFile(plugin.path, trashFilePath)
                await fs.promises.rm(plugin.path)

                // catat di metadata
                const trashList = await this._readTrashMeta()
                const trashItem = {
                    id: randomUUID().slice(0, 8),
                    name: plugin.name || baseName,
                    commands: Array.isArray(plugin.commands) ? [...plugin.commands] : [command],
                    filename: baseName,
                    originalPath: plugin.path,
                    trashPath: trashFilePath,
                    deletedAt: Date.now()
                }
                trashList.unshift(trashItem)
                await this._writeTrashMeta(trashList)
            }

            // hapus plugin dari map
            for (const cmd of plugin.commands) {
                this.pluginMap.delete(cmd)
            }

            // hapus plugin dari array
            const pluginIndex = this.pluginArray.findIndex(p => {
                return p.path === plugin.path || p.commands.some(cmd => cmd === command)
            })
            if (pluginIndex !== -1) {
                this.pluginArray.splice(pluginIndex, 1)
            }

            // susun kata kata respon
            const actionText = hard ? "berhasil di uninstall (permanen)" : "berhasil dipindahkan ke Trash"
            const kataKata = `*🗑️ Plugin ${actionText}*\n` +
                `• Nama: ${plugin.name}\n` +
                `• Command: ${plugin.commands.join(', ')}\n` +
                `• Path: ${plugin.path}` +
                (!hard ? `\n💡 _Ketik *plugin restore ${command}* jika ingin mengembalikan._` : '')
            return success(kataKata)

        } catch (e) {
            console.error(`gagal hapus plugin`, e)
            return fail('error: ' + e.message)
        }
    }

    /**
     * Restore plugin dari trash
     * @param {string} keyword (command, filename, name, atau id)
     * @returns {Promise<managerResponse>}
     */
    async restorePlugin(keyword) {
        try {
            if (!keyword) return fail(`😮‍💨 Mau restore plugin apa sayang? Kasih nama command atau filenya yaa...`)

            const query = String(keyword).trim().toLowerCase()
            const trashList = await this._readTrashMeta()

            if (!trashList.length) return fail(`🗑️ Tempat sampah (Trash) sedang kosong.`)

            const matchIndex = trashList.findIndex(item => {
                if (item.id === query) return true
                if (item.filename?.toLowerCase() === query) return true
                if (item.name?.toLowerCase() === query) return true
                if (Array.isArray(item.commands) && item.commands.some(c => c.toLowerCase() === query)) return true
                return false
            })

            if (matchIndex === -1) {
                return fail(`👻 Plugin *${keyword}* tidak ditemukan di Trash. Cek daftar dengan *plugin trash*.`)
            }

            const item = trashList[matchIndex]

            // Cek file di trash masih ada apa nggak
            if (!fs.existsSync(item.trashPath)) {
                trashList.splice(matchIndex, 1)
                await this._writeTrashMeta(trashList)
                return fail(`❌ File di trash sudah tidak ditemukan atau rusak. Item telah dibersihkan dari daftar.`)
            }

            // Baca buffer dan reinstall via install (replace mode true)
            const buffer = await fs.promises.readFile(item.trashPath)
            const installRes = await this.install(buffer, true)

            if (!installRes.ok) {
                return fail(`❌ Gagal restore plugin: ${installRes.message}`)
            }

            // Hapus file dari trash & update metadata
            await fs.promises.rm(item.trashPath).catch(() => {})
            trashList.splice(matchIndex, 1)
            await this._writeTrashMeta(trashList)

            return success(
                `*✅ Plugin berhasil di-restore!*\n` +
                `• Nama: ${item.name}\n` +
                `• Command: ${item.commands.join(', ')}\n` +
                `• File: ${item.filename}`
            )
        } catch (e) {
            console.error(`gagal restore plugin`, e)
            return fail('error: ' + e.message)
        }
    }

    /**
     * Kosongkan trash
     * @returns {Promise<number>} jumlah plugin yang dihapus permanen
     */
    async emptyTrash() {
        try {
            const trashList = await this._readTrashMeta()
            const count = trashList.length

            if (fs.existsSync(allPaths.trashDir)) {
                await fs.promises.rm(allPaths.trashDir, { recursive: true, force: true })
                await mkdir(allPaths.trashDir, { recursive: true })
            }

            await this._writeTrashMeta([])
            return count
        } catch (e) {
            console.error(`[PLUGIN TRASH] Gagal mengosongkan trash:`, e)
            return 0
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