/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { backupManager } from "#manager/backup-manager.js"
import { config } from "#root/config.js"

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B"
    const units = ["B", "KB", "MB", "GB"]
    let i = 0
    let num = bytes
    while (num >= 1024 && i < units.length - 1) {
        num /= 1024
        i++
    }
    return `${num.toFixed(2)} ${units[i]}`
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text, isOwner } = ctx

    if (!isOwner) {
        return await m.arashirep("❌ Perintah ini khusus untuk Owner bot.")
    }

    const inputPass = (text || "").trim() || null

    await m.react("⏳")
    await m.arashirep("🔒 Menyiapkan arsip dan mengenkripsi sesi auth + data konfigurasi dengan AES-256-GCM...")

    try {
        const res = await backupManager.createEncryptedBackup(inputPass)

        const caption =
            `🔐 *ENCRYPTED BOT BACKUP*\n` +
            `────────────────────\n` +
            `• Nama File : \`${res.fileName}\`\n` +
            `• Ukuran    : *${formatBytes(res.sizeBytes)}*\n` +
            `• Enkripsi  : *AES-256-GCM* (Scrypt Key Derivation)\n` +
            `• Password  : *${res.passphrase}*\n` +
            `────────────────────\n` +
            `⚠️ *PERINGATAN KEAMANAN:*\n` +
            `File ini berisi kredensial login sesi WhatsApp (\`auth/\`) dan database konfigurasi bot yang sudah terenkripsi penuh. ` +
            `Simpan file \`.enc\` dan password ini di tempat yang aman di luar VPS.\n\n` +
            `📌 *Cara Ekstrak / Restore Offline:*\n` +
            `\`node scripts/decrypt-backup.js ${res.fileName} "${res.passphrase}" ./output\``

        // Kirim dokumen .enc
        await sock.sendMessage(
            jid,
            {
                document: res.buffer,
                mimetype: "application/octet-stream",
                fileName: res.fileName,
                caption
            },
            { quoted: m }
        )

        await m.react("✅")
    } catch (err) {
        await m.react("❌")
        return await m.arashirep(`❌ Gagal membuat backup terenkripsi: ${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "encrypted bot backup",
    commands: ["backup", "backupbot", "bkp"],
    categories: ["owner"],
    description: "buat backup sesi auth dan database konfigurasi terenkripsi AES-256-GCM"
}

plugin.meta = {
    filename: "backup.js",
    version: "1.0",
    author: "Kadokun x Arashi",
    note: "Encrypted AES-256-GCM backup for auth and configs",
    path: "owner"
}

export default plugin
