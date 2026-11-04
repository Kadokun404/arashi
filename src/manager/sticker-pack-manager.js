import { allPaths } from "#root/src/all-paths.js"
import fs from "node:fs"
import path from "node:path"

const DB_PATH = allPaths.stickerPackDb
const PACKS_DIR = allPaths.stickerPacksDir

// Pastikan direktori ada
if (!fs.existsSync(PACKS_DIR)) {
    fs.mkdirSync(PACKS_DIR, { recursive: true })
}

let db = {}
try {
    if (fs.existsSync(DB_PATH)) {
        db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"))
    } else {
        fs.writeFileSync(DB_PATH, "{}", "utf8")
    }
} catch {
    db = {}
}

const saveDb = () => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8")
    } catch (e) {
        console.error("[sticker-pack-manager] gagal menyimpan database:", e.message)
    }
}

const cleanId = (id) => String(id || "").replace(/[^a-zA-Z0-9_-]/g, "")

export const stickerPackManager = {
    /**
     * Ambil data sticker pack user
     */
    getUserPack(senderId) {
        const id = cleanId(senderId)
        if (!id) return { name: "Arashi Pack", publisher: "Arashi", stickers: [] }

        if (!db[id]) {
            db[id] = {
                name: "Arashi Pack",
                publisher: "Arashi",
                stickers: []
            }
        }
        return db[id]
    },

    /**
     * Update nama / publisher pack
     */
    setPackInfo(senderId, { name, publisher }) {
        const pack = this.getUserPack(senderId)
        if (name && typeof name === "string") pack.name = name.trim()
        if (publisher && typeof publisher === "string") pack.publisher = publisher.trim()
        saveDb()
        return pack
    },

    /**
     * Tambah stiker ke pack user
     */
    async addSticker(senderId, stickerData) {
        const id = cleanId(senderId)
        const pack = this.getUserPack(id)
        const { sha256, buffer, ext = "webp", mimetype = "image/webp", isAnimated = false, isLottie = false } = stickerData

        if (!sha256 || !buffer) throw new Error("Data stiker tidak lengkap.")

        // Cek duplikasi
        if (pack.stickers.some((s) => s.sha256 === sha256)) {
            return { duplicate: true, total: pack.stickers.length }
        }

        const userDir = path.join(PACKS_DIR, id)
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true })
        }

        const filePath = path.join(userDir, `${sha256}.${ext}`)
        fs.writeFileSync(filePath, buffer)

        pack.stickers.push({
            sha256,
            ext,
            mimetype,
            isAnimated: Boolean(isAnimated),
            isLottie: Boolean(isLottie),
            createdAt: Date.now()
        })

        saveDb()
        return { duplicate: false, total: pack.stickers.length }
    },

    /**
     * Hapus satu stiker dari pack user
     */
    async removeSticker(senderId, sha256) {
        const id = cleanId(senderId)
        const pack = this.getUserPack(id)

        const idx = pack.stickers.findIndex((s) => s.sha256 === sha256)
        if (idx === -1) {
            return { removed: false, total: pack.stickers.length }
        }

        const [item] = pack.stickers.splice(idx, 1)
        const filePath = path.join(PACKS_DIR, id, `${item.sha256}.${item.ext}`)
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath)
            } catch (_) {}
        }

        saveDb()
        return { removed: true, total: pack.stickers.length }
    },

    /**
     * Kosongkan pack user
     */
    async clearPack(senderId) {
        const id = cleanId(senderId)
        const pack = this.getUserPack(id)

        const userDir = path.join(PACKS_DIR, id)
        if (fs.existsSync(userDir)) {
            try {
                fs.rmSync(userDir, { recursive: true, force: true })
            } catch (_) {}
        }

        pack.stickers = []
        saveDb()
        return true
    },

    /**
     * Ambil buffer semua stiker yang tersimpan untuk dibuat pack zip
     */
    async getStickerBuffers(senderId) {
        const id = cleanId(senderId)
        const pack = this.getUserPack(id)
        const userDir = path.join(PACKS_DIR, id)

        const list = []
        const validStickers = []

        for (const s of pack.stickers) {
            const filePath = path.join(userDir, `${s.sha256}.${s.ext}`)
            if (fs.existsSync(filePath)) {
                try {
                    const buf = fs.readFileSync(filePath)
                    list.push({
                        ...s,
                        buffer: buf
                    })
                    validStickers.push(s)
                } catch (_) {}
            }
        }

        // Sinkronisasi jika ada file yang hilang
        if (validStickers.length !== pack.stickers.length) {
            pack.stickers = validStickers
            saveDb()
        }

        return {
            name: pack.name || "Arashi Pack",
            publisher: pack.publisher || "Arashi",
            stickers: list
        }
    }
}
