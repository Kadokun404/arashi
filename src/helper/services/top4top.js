/**
 * © JamvanHax0r — Fiony Bot
 * t4t.js — Shared uploader ke top4top.io.
 * Diadaptasi dari kode asli, dipakai sebagai helper upload buffer -> direct link.
 */
import axios from "axios"
import { fileTypeFromBuffer } from "file-type"
import FormData from "form-data"

export default async function uploadTop4top(buffer) {
    try {
        let fileType = await fileTypeFromBuffer(buffer)
        let ext = fileType ? fileType.ext : "bin"
        let mime = fileType ? fileType.mime : "application/octet-stream"

        let form = new FormData()
        form.append("file_0_", buffer, {
            filename: `${~~(Math.random() * 9e4)}.${ext}`,
            contentType: mime
        })
        form.append("submitr", "[ رفع الملفات ]")

        let response = await axios.post("https://top4top.io/index.php", form, {
            headers: {
                ...form.getHeaders(),
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml"
            },
            timeout: 30000
        })

        let html = response.data
        let match = html.match(/(https?:\/\/[a-zA-Z0-9.-]+\.top4top\.io\/[a-z]_[^"'\s<>]+)/)

        if (!match || !match[1]) {
            throw "Upload gagal, direct link tidak ditemukan di respons server"
        }

        return { url: match[1], ext, mime, size: buffer.length }
    } catch (e) {
        let errMessage = e?.message || e || "Terjadi kesalahan yang tidak diketahui saat upload ke top4top"
        throw new Error(errMessage)
    }
}
