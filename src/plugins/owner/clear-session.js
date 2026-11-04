/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import fs from "node:fs"
import path from "node:path"

// Sesuaikan dengan nama folder sesi bot kamu
const SESSION_FOLDER = "auth" 
// Daftar folder temp yang ingin dibersihkan
const TEMP_FOLDERS = ["src/temp", "temp"]

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return
    const { m } = ctx

    let sessionFileCount = 0
    let sessionFolderCount = 0
    let tempFileCount = 0
    let tempFolderCount = 0
    
    const deletedSession = []
    const deletedTemp = []

    // 1. Membersihkan Folder Sesi
    if (fs.existsSync(SESSION_FOLDER)) {
        const files = fs.readdirSync(SESSION_FOLDER)
        for (const file of files) {
            // PENTING: Mengecualikan creds.json dan app_state
            if (
                file === "creds.json" || 
                file.startsWith("app-state") || 
                file.startsWith("app_state")
            ) {
                continue
            }

            const fullPath = path.join(SESSION_FOLDER, file)

            try {
                const stat = fs.lstatSync(fullPath)
                fs.rmSync(fullPath, { recursive: true, force: true })

                if (stat.isDirectory()) sessionFolderCount++
                else sessionFileCount++

                deletedSession.push(file)
            } catch {
                continue
            }
        }
    }

    // 2. Membersihkan Folder Temp
    for (const tempDir of TEMP_FOLDERS) {
        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir)
            for (const file of files) {
                const fullPath = path.join(tempDir, file)

                try {
                    const stat = fs.lstatSync(fullPath)
                    fs.rmSync(fullPath, { recursive: true, force: true })

                    if (stat.isDirectory()) tempFolderCount++
                    else tempFileCount++

                    deletedTemp.push(file)
                } catch {
                    continue
                }
            }
        }
    }

    // Cek jika tidak ada yang dihapus sama sekali
    if (!deletedSession.length && !deletedTemp.length) {
        return await m.arashirep("Sesi dan Temp sudah bersih, tidak ada file sampah tersisa.")
    }

    // 3. Menyusun Pesan Balasan
    let text = `Clear System Berhasil\n\n`

    if (deletedSession.length > 0) {
        text += `Sesi (${SESSION_FOLDER})\n`
        text += `- File dihapus: ${sessionFileCount}\n`
        text += `- Folder dihapus: ${sessionFolderCount}\n\n`
    }

    if (deletedTemp.length > 0) {
        text += `Temp Files\n`
        text += `- File dihapus: ${tempFileCount}\n`
        text += `- Folder dihapus: ${tempFolderCount}\n\n`
    }

    // Mengambil beberapa sampel file yang dihapus untuk ditampilkan
    const shownSession = deletedSession.slice(0, 5)
    const shownTemp = deletedTemp.slice(0, 5)

    if (shownSession.length > 0 || shownTemp.length > 0) {
        text += `Beberapa file yang dihapus:\n`
        shownSession.forEach(f => text += `- ${f} (sesi)\n`)
        shownTemp.forEach(f => text += `- ${f} (temp)\n`)
    }


    await m.arashirep(text)
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "clear session & temp",
    commands: ["csesi", "clearsesi", "clear"],
    categories: ["owner"],
    description: "Membersihkan sampah keys pada folder sesi & file sampah pada folder temp."
}

plugin.meta = {
    filename: "clear-sesi.js",
    version: "2",
    author: "Kado",
    note: "safe clean session and temp",
    path: "owner"
}

export default plugin