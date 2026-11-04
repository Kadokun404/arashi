#!/usr/bin/env node
/**
 * scripts/decrypt-backup.js
 *
 * Script mandiri untuk mendekripsi dan mengekstrak file backup terenkripsi Arashi (.enc).
 * Cara pakai:
 *   node scripts/decrypt-backup.js <path-ke-file.enc> <passphrase> [folder-tujuan]
 *
 * Contoh:
 *   node scripts/decrypt-backup.js arashi_backup_20261103.enc rahasia123 ./restore
 */

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import JSZip from "jszip"

const MAGIC_HEADER = "ARABKP1"

function decryptBuffer(encBuffer, passphrase) {
    if (encBuffer.length < 51) {
        throw new Error("Ukuran file backup terlalu kecil / corrupt.")
    }

    const magic = encBuffer.subarray(0, 7).toString("ascii")
    if (magic !== MAGIC_HEADER) {
        throw new Error("File bukan format backup Arashi yang valid (Header tidak cocok).")
    }

    const salt = encBuffer.subarray(7, 23)
    const iv = encBuffer.subarray(23, 35)
    const tag = encBuffer.subarray(35, 51)
    const ciphertext = encBuffer.subarray(51)

    const key = crypto.scryptSync(passphrase, salt, 32)
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length < 2) {
        console.log("Usage:")
        console.log("  node scripts/decrypt-backup.js <file.enc> <passphrase> [outputDir]\n")
        console.log("Contoh:")
        console.log("  node scripts/decrypt-backup.js data/backups/arashi_backup_xxx.enc password123 ./restore")
        process.exit(1)
    }

    const [filePath, passphrase, outputDir = "./restore"] = args

    if (!fs.existsSync(filePath)) {
        console.error(`❌ File tidak ditemukan: ${filePath}`)
        process.exit(1)
    }

    console.log(`🔒 Membaca file: ${filePath}`)
    const encBuffer = fs.readFileSync(filePath)

    console.log(`🔑 Mendekripsi dengan AES-256-GCM...`)
    let zipBuffer
    try {
        zipBuffer = decryptBuffer(encBuffer, passphrase)
    } catch (err) {
        console.error(`❌ Gagal mendekripsi: ${err.message}`)
        console.error(`   Pastikan password yang dimasukkan sudah benar!`)
        process.exit(1)
    }

    console.log(`📦 Mengekstrak isi arsip ke: ${outputDir}...`)
    const zip = await JSZip.loadAsync(zipBuffer)
    const dest = path.resolve(outputDir)

    for (const [relPath, fileObj] of Object.entries(zip.files)) {
        const targetPath = path.join(dest, relPath)
        if (fileObj.dir) {
            fs.mkdirSync(targetPath, { recursive: true })
        } else {
            fs.mkdirSync(path.dirname(targetPath), { recursive: true })
            const content = await fileObj.async("nodebuffer")
            fs.writeFileSync(targetPath, content)
        }
    }

    console.log(`✅ Berhasil! Seluruh file auth/ dan data/ telah diekstrak ke: ${dest}`)
}

main().catch((err) => {
    console.error("Fatal Error:", err)
    process.exit(1)
})
