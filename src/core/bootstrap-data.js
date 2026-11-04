import fs from "node:fs/promises"
import path from "node:path"
import { allPaths } from "./all-paths.js"

/**
 * bootstrap-data.js
 *
 * Auto-create semua file JSON yang ada di data/ (sesuai daftar di all-paths.js)
 * pas bot pertama kali run, KALAU file nya belum ada. Kalau udah ada, gak
 * disentuh sama sekali (gak di-overwrite, gak di-reset).
 *
 * ini jaring pengaman tambahan di luar auto-create yang udah ada di
 * masing-masing manager/store (json-db.js, chat-manager.js, theme-manager.js,
 * dll) -- soalnya beberapa di antaranya baru auto-create pas manager nya
 * pertama kali dipanggil, bukan pas bot start. Modul ini mastiin folder
 * data/ dan seluruh file default nya udah ada dari awal.
 *
 * default value per file disesuaikan sama bentuk yang di-expect masing-masing
 * consumer nya (array kosong buat json-db based, object kosong/default buat
 * config-style).
 */

/** @type {Record<string, any>} key = allPaths key, value = default content kalau file belum ada */
const DEFAULT_CONTENT = {
    prefix: { prefixes: ["."], strict: false },
    trustDb: [],
    pamDb: [],
    debugConfig: {},
    themeConfig: {},
    restartFlag: {},
    chatManagerConfig: { groupMode: 2, privateMode: 0, groupsWhitelist: {} },
    antilinkConfig: {},
    groupOpenCloseConfig: {},
    aliasConfig: [],
    tmbConfig: {},
    botNameDb: { names: [], locked: {} },

    // hasil merge dari Karina
    userDb: [],
    groupSettingsDb: {},
    lockDb: { globalLocked: false, lockedChats: {} },
    selfPublicConfig: { mode: "self" },
    crmConfig: {}
}

const bootstrapData = async () => {
    await fs.mkdir(allPaths.root ? path.join(allPaths.root, "../data") : path.join(process.cwd(), "data"), { recursive: true }).catch(() => {})

    let created = 0
    let skipped = 0

    for (const [key, filePath] of Object.entries(allPaths)) {
        // cuma yang path nya nunjuk ke file .json di dalem data/
        if (!filePath || typeof filePath !== "string") continue
        if (!filePath.endsWith(".json")) continue
        if (!(key in DEFAULT_CONTENT)) continue

        try {
            await fs.access(filePath)
            skipped++
        } catch {
            // belum ada -> bikin baru
            await fs.mkdir(path.dirname(filePath), { recursive: true })
            await fs.writeFile(filePath, JSON.stringify(DEFAULT_CONTENT[key], null, 2))
            created++
            console.log(`[bootstrap-data] created ${path.relative(process.cwd(), filePath)}`)
        }
    }

    console.log(`[bootstrap-data] done, ${created} file dibuat, ${skipped} file udah ada (di-skip)`)
}

export { bootstrapData }
