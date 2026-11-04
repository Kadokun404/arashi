/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { stickerPackManager } from "#manager/sticker-pack-manager.js"
import {
    classifySticker,
    sha256,
    sendCustomStickerPack
} from "#helper/sticker-pack.js"
import { config } from "#root/config.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text, command } = ctx

    const senderId = (m.contact?.pn || m.sender || m.key.participant || m.key.remoteJid || "").replace(/[^0-9]/g, "")
    const cmd = String(command || "").toLowerCase()

    // 1. TAMBAH STIKER KE PACK
    if (cmd === "addtspk" || cmd === "addpack" || cmd === "savetspk") {
        const target = q?.content === "stickerMessage" ? q : (m.content === "stickerMessage" ? m : null)

        if (!target) {
            return await m.arashirep("Reply stiker yang mau kamu simpan ke sticker pack dengan *.addtspk*")
        }

        await m.react("⏳")
        try {
            const buffer = await target.download("buffer")
            if (!buffer) throw new Error("Gagal mengunduh stiker.")

            const stickerMsg = target.message?.stickerMessage
            const classified = classifySticker(buffer, stickerMsg)
            const hash = sha256(buffer).toString("hex")

            const result = await stickerPackManager.addSticker(senderId, {
                buffer,
                sha256: hash,
                ...classified
            })

            if (result.duplicate) {
                await m.react("⚠️")
                return await m.arashirep("⚠️ Stiker ini sudah ada di dalam sticker pack kamu!")
            }

            await m.react("✅")
            const label = classified.isLottie ? "Lottie" : classified.isAnimated ? "Animated" : "Statis"
            const hintMin = result.total < 3
                ? `\n\n💡 *Tips:* WhatsApp memerlukan minimal 3 stiker dalam 1 pack agar tombol simpan/tambahkan ke koleksi WA bisa aktif.`
                : ""

            return await m.arashirep(
                `✅ *Stiker berhasil ditambahkan!* (${label})\n` +
                `📦 Total saat ini: *${result.total} stiker* di pack kamu.${hintMin}\n\n` +
                `Ketik *.tspk* untuk mengirim stiker pack ini ke chat!`
            )
        } catch (err) {
            await m.react("❌")
            return await m.arashirep(`❌ Gagal menambahkan stiker: ${err.message}`)
        }
    }

    // 2. HAPUS STIKER DARI PACK
    if (cmd === "deltspk" || cmd === "delpack" || cmd === "removetspk") {
        const target = q?.content === "stickerMessage" ? q : (m.content === "stickerMessage" ? m : null)

        if (!target) {
            return await m.arashirep("Reply stiker yang ingin dihapus dari pack dengan *.deltspk*")
        }

        await m.react("⏳")
        try {
            let hash = null
            if (target.message?.stickerMessage?.fileSha256) {
                hash = Buffer.from(target.message.stickerMessage.fileSha256).toString("hex")
            }
            if (!hash) {
                const buffer = await target.download("buffer")
                hash = sha256(buffer).toString("hex")
            }

            const result = await stickerPackManager.removeSticker(senderId, hash)
            if (!result.removed) {
                await m.react("⚠️")
                return await m.arashirep("⚠️ Stiker tersebut tidak ditemukan di dalam pack kamu.")
            }

            await m.react("✅")
            return await m.arashirep(`✅ Stiker berhasil dihapus. Sisa *${result.total} stiker* di pack kamu.`)
        } catch (err) {
            await m.react("❌")
            return await m.arashirep(`❌ Gagal menghapus stiker: ${err.message}`)
        }
    }

    // 3. LIHAT DAFTAR / INFO PACK
    if (cmd === "listtspk" || cmd === "mytspk") {
        const pack = stickerPackManager.getUserPack(senderId)
        if (!pack.stickers || !pack.stickers.length) {
            return await m.arashirep(
                `📦 *Sticker Pack Kamu Masih Kosong!*\n\n` +
                `Cara mengisinya:\n` +
                `1. Cari atau kirim stiker apa saja di chat\n` +
                `2. Reply stiker tersebut dan ketik *.addtspk*\n` +
                `3. Kumpulkan minimal 3 stiker lalu kirim dengan *.tspk*`
            )
        }

        const animatedCount = pack.stickers.filter((s) => s.isAnimated).length
        const staticCount = pack.stickers.length - animatedCount

        return await m.arashirep(
            `╭───「 *MY STICKER PACK* 」\n` +
            `│ 🏷️ *Nama Pack:* ${pack.name || "Arashi Pack"}\n` +
            `│ 👤 *Publisher:* ${pack.publisher || "Arashi"}\n` +
            `│ 📦 *Total Stiker:* ${pack.stickers.length}\n` +
            `│   ├ 🖼️ Statis: ${staticCount}\n` +
            `│   └ 🎬 Animasi: ${animatedCount}\n` +
            `│\n` +
            `│ 📌 *Menu Perintah:*\n` +
            `│ • *.tspk* -> Kirim sticker pack kamu\n` +
            `│ • *.tspk Nama | Creator* -> Kirim dengan nama custom\n` +
            `│ • *.addtspk* (reply stiker) -> Tambah stiker\n` +
            `│ • *.deltspk* (reply stiker) -> Hapus stiker\n` +
            `│ • *.cleartspk* -> Kosongkan seluruh isi pack\n` +
            `╰──────────────────`
        )
    }

    // 4. KOSONGKAN PACK
    if (cmd === "cleartspk" || cmd === "resettspk") {
        await stickerPackManager.clearPack(senderId)
        await m.react("🗑️")
        return await m.arashirep("🗑️ Sticker pack kamu berhasil dikosongkan!")
    }

    // 5. KIRIM STICKER PACK (.tspk)
    if (cmd === "tspk" || cmd === "sendtspk" || cmd === "stickerpack" || cmd === "packstiker") {
        const packData = await stickerPackManager.getStickerBuffers(senderId)

        if (!packData.stickers || !packData.stickers.length) {
            return await m.arashirep(
                `📦 *Pack kamu masih kosong!*\n\n` +
                `Tambahkan stiker terlebih dahulu dengan me-reply stiker lalu ketik *.addtspk*`
            )
        }

        // Cek argumen custom name | publisher
        let customName = packData.name
        let customPublisher = packData.publisher

        if (text && text.trim()) {
            const raw = text.trim()
            if (raw.includes("|")) {
                const parts = raw.split("|").map((p) => p.trim())
                if (parts[0]) customName = parts[0]
                if (parts[1]) customPublisher = parts[1]
            } else {
                customName = raw
            }
            stickerPackManager.setPackInfo(senderId, { name: customName, publisher: customPublisher })
        }

        await m.react("⏳")
        try {
            await sendCustomStickerPack(
                sock,
                jid,
                packData.stickers,
                {
                    name: customName || `${m.contact?.name || "Kado"} Pack`,
                    publisher: customPublisher || config.botName || "Arashi",
                    description: `Dibuat menggunakan bot ${config.botName || "Arashi"}`
                },
                m
            )
            await m.react("⚡")
        } catch (err) {
            await m.react("❌")
            return await m.arashirep(`❌ Gagal mengirim sticker pack: ${err.message}`)
        }
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "whatsapp sticker pack",
    commands: ["tspk", "addtspk", "deltspk", "listtspk", "cleartspk", "addpack", "delpack", "stickerpack", "packstiker", "resettspk", "mytspk"],
    categories: ["maker"],
    description: "buat dan kirim custom whatsapp sticker pack (.tspk, .addtspk, .deltspk, .listtspk, .cleartspk)"
}

plugin.meta = {
    filename: "stickerpack.js",
    version: "1.0",
    author: "Kado x Arashi",
    note: "WhatsApp Native StickerPackMessage with tray icon & animated support",
    path: "maker"
}

export default plugin
