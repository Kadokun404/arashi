import { allPaths } from "#root/src/all-paths.js"
import { tempFileLock } from "#root/src/async-lock.js"
import path from "node:path"
import fs from "node:fs"

/**
 * upload buffer gambar ke cloud.yardansh.com, balikin response asli dari servernya
 * (ada .url, .size, .expiresAt, dll). di pake bareng2 sama tourl.js & tmb
 * (testmenubutton) buat convert gambar jadi url
 * @param {Buffer} buffer
 * @param {string} [ext] ekstensi file, default "jpg"
 * @returns {Promise<{url: string, [key: string]: any}>}
 */
async function uploadBuffer(buffer, ext = "jpg") {
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const filePath = path.join(allPaths.temp, fileName)

    await fs.promises.mkdir(allPaths.temp, { recursive: true })
    await tempFileLock.withLock(fileName, async () => {
        await fs.promises.writeFile(filePath, buffer)
    })

    const blob = await fs.openAsBlob(filePath)
    const formData = new FormData()
    formData.append("file", blob, fileName)

    const res = await fetch("https://cloud.yardansh.com/upload", { method: "POST", body: formData })
    if (!res.ok) throw new Error(`upload gagal: ${res.status} ${res.statusText}`)

    return await res.json()
}

/**
 * cek url bisa di akses beneran apa enggak (HEAD request, timeout 5 detik)
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function isUrlAccessible(url) {
    try {
        const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) })
        return res.ok
    } catch {
        return false
    }
}

export { uploadBuffer, isUrlAccessible }
