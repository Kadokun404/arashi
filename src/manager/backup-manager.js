import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import JSZip from "jszip"

const BACKUP_DIR = path.join(process.cwd(), "data", "backups")
const MAGIC_HEADER = "ARABKP1"

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

/**
 * Enkripsi buffer menggunakan AES-256-GCM + scrypt
 * @param {Buffer} buffer
 * @param {string} passphrase
 */
export function encryptBackupBuffer(buffer, passphrase) {
    if (!passphrase || typeof passphrase !== "string") {
        throw new Error("Passphrase backup wajib diisi.")
    }

    const salt = crypto.randomBytes(16)
    const iv = crypto.randomBytes(12)
    const key = crypto.scryptSync(passphrase, salt, 32)

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()])
    const tag = cipher.getAuthTag()

    const magic = Buffer.from(MAGIC_HEADER, "ascii")
    return Buffer.concat([magic, salt, iv, tag, ciphertext])
}

/**
 * Dekripsi file .enc menggunakan AES-256-GCM + scrypt
 * @param {Buffer} encBuffer
 * @param {string} passphrase
 */
export function decryptBackupBuffer(encBuffer, passphrase) {
    if (!passphrase || typeof passphrase !== "string") {
        throw new Error("Passphrase wajib diisi.")
    }

    const magic = encBuffer.subarray(0, 7).toString("ascii")
    if (magic !== MAGIC_HEADER) {
        throw new Error("Format file bukan backup Arashi yang valid (Magic header tidak sesuai).")
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

export const backupManager = {
    /**
     * Buat arsip zip berisi auth/ dan file konfigurasi data/
     */
    async createZipArchive() {
        const zip = new JSZip()
        const rootDir = process.cwd()

        // 1. Masukkan seluruh file auth/
        const authDir = path.join(rootDir, "auth")
        if (fs.existsSync(authDir)) {
            const addDir = (dirPath, zipFolder) => {
                const entries = fs.readdirSync(dirPath)
                for (const entry of entries) {
                    const full = path.join(dirPath, entry)
                    const stat = fs.statSync(full)
                    if (stat.isDirectory()) {
                        addDir(full, zipFolder.folder(entry))
                    } else {
                        zipFolder.file(entry, fs.readFileSync(full))
                    }
                }
            }
            addDir(authDir, zip.folder("auth"))
        }

        // 2. Masukkan file konfigurasi penting di data/ (json dan database.db, abaikan db besar crmdb/messagestore)
        const dataDir = path.join(rootDir, "data")
        if (fs.existsSync(dataDir)) {
            const dataFolder = zip.folder("data")
            const entries = fs.readdirSync(dataDir)
            for (const entry of entries) {
                // Jangan masukkan database pesan raksasa atau wal
                if (entry.startsWith("crmdb") || entry.startsWith("messagestore") || entry === "backups") {
                    continue
                }
                const full = path.join(dataDir, entry)
                const stat = fs.statSync(full)
                if (stat.isFile()) {
                    dataFolder.file(entry, fs.readFileSync(full))
                }
            }
        }

        return await zip.generateAsync({
            type: "nodebuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 }
        })
    },

    /**
     * Buat backup terenkripsi lengkap
     * @param {string} customPassphrase
     */
    async createEncryptedBackup(customPassphrase = null) {
        const passphrase = customPassphrase || `Arashi_${crypto.randomBytes(6).toString("hex")}`
        const rawZipBuffer = await this.createZipArchive()
        const encryptedBuffer = encryptBackupBuffer(rawZipBuffer, passphrase)

        const now = new Date()
        const dateStr = now.toISOString().replace(/[-:T]/g, "").slice(0, 14)
        const fileName = `arashi_backup_${dateStr}.enc`
        const filePath = path.join(BACKUP_DIR, fileName)

        fs.writeFileSync(filePath, encryptedBuffer)

        return {
            fileName,
            filePath,
            buffer: encryptedBuffer,
            sizeBytes: encryptedBuffer.length,
            passphrase,
            isCustomPassphrase: Boolean(customPassphrase)
        }
    }
}

export default backupManager
