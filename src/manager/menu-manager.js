/**
 * @import { Plugin } from "../types/types.js"
 */

/**
 * @typedef {object} MenuCategoryContent
 * @property {string[]} textArray
 * @property {string[]} commandArray
 * @property {string} finalText
 */

import { pluginManager } from "./plugin-manager.js"

class MenuManager {
    /**@type {Map<string, MenuCategoryContent>} */
    categoryMap = new Map()
    categoryArray = []
    categoryText = undefined
    allMenuText = undefined

    /**
     * @param { typeof pluginManager.pluginArray } pluginArray 
     */
    buildMenu(pluginArray) {
        this.buildMenu2(pluginManager.pluginArray)
        console.log(`menu built`)
    }

    /**
     * @param { Plugin [] } pluginArray 
     */
    buildMenu2(pluginArray) {
        // CLEAN UP
        this.categoryMap.clear()
        this.categoryArray.length = 0
        this.categoryText = undefined
        this.allMenuText = undefined

        // ===== 1. KUMPULKAN SETIAP PLUGIN PER KATEGORI (1 plugin = 1 baris, alias dalam kurung) =====
        pluginArray.forEach(plugin => {
            // Sembunyikan plugin jika ada config hidden atau hidden=true
            if (plugin?.config?.hidden || plugin?.hidden) return

            // Filter command utilitas / reaction trigger yang tidak perlu tampil di menu
            const EXCLUDED_CMDS = ["!", "!!", "$", "❌", "😋", "🤓"]
            const rawCommands = (plugin.commands || []).filter(c => c && !EXCLUDED_CMDS.includes(c))
            if (!rawCommands.length) return
            const commands = [...new Set(rawCommands)]

            // Sembunyikan kategori 'example' dari menu publik
            const categories = (plugin.categories || []).filter(c => c !== "example")
            if (!categories.length) return

            const [mainCmd, ...aliases] = commands
            const line = aliases.length > 0
                ? `${mainCmd} ( ${aliases.join(", ")} )`
                : `${mainCmd}`

            categories.forEach(category => {
                if (!this.categoryMap.has(category)) {
                    this.categoryMap.set(category, {
                        textArray: [],
                        commandArray: [],
                        finalText: undefined,
                    })
                }
                const cat = this.categoryMap.get(category)
                if (!cat.textArray.includes(line)) {
                    cat.textArray.push(line)
                }
                cat.commandArray.push(...commands)
            })
        })

        // ===== 2. URUTKAN KATEGORI (prioritas + alfabetis) =====
        const PRIORITY_ORDER = [
            "main", "premium", "ai", "downloader", "search", "maker",
            "tools", "group", "fun", "owner", "nsfw"
        ]
        const allCategories = Array.from(this.categoryMap.keys())
        const prioritized = PRIORITY_ORDER.filter(c => allCategories.includes(c))
        const rest = allCategories.filter(c => !PRIORITY_ORDER.includes(c)).sort()
        this.categoryArray = [...prioritized, ...rest]

        // ===== 3. categoryText untuk menu utama =====
        this.categoryText = this.categoryArray.map(cat => `${cat}`).join('\n')

        // ===== 4. finalText per kategori =====
        this.categoryArray.forEach(category => {
            const cat = this.categoryMap.get(category)
            cat.textArray.sort((a, b) => a.localeCompare(b))
            // ← ubah judul kategori pakai ム, tanpa bold
            cat.finalText = `${category}\n${cat.textArray.join('\n')}`
        })

        // ===== 5. allMenuText =====
        this.allMenuText = this.categoryArray
            .map(category => this.categoryMap.get(category).finalText)
            .join('\n\n') // satu baris kosong antar kategori
    }
}

const menuManager = new MenuManager()
await menuManager.buildMenu()
export { menuManager }