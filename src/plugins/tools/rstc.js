/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { isJidGroup } from "baileys"
import crypto from "crypto"
import { reactStickerManager } from "#manager/react-sticker-manager.js"
import { config } from "#root/config.js"

const SPAM_COUNT_DEFAULT = 10
const SPAM_COUNT_MAX = 500
const SPAM_DELAY_MS = 700

const HELP_TEXT =
    `*rstc* [nama] [jumlah] ( reply pesan apa aja: text/gambar/audio/vn/dokumen )\n` +
    `  -> nembak stiker "nama" (default: *default*) ke pesan yang di-reply, sebanyak "jumlah" (default: ${SPAM_COUNT_DEFAULT}, max ${SPAM_COUNT_MAX}), stiker dipilih acak kalau nama itu punya lebih dari satu\n` +
    `  contoh: *rstc ara 2*\n\n` +
    `*rstc add [nama]* ( sambil reply stiker, statis maupun animated )\n` +
    `  -> nambahin stiker itu ke daftar "nama" (default: *default*), bisa dipanggil berkali kali buat nama yang sama\n\n` +
    `*rstc del <nama>* / *rstc del <nama> <index>*\n` +
    `  -> hapus semua stiker di nama itu, atau cuma satu index-nya aja\n\n` +
    `*rstc list*\n` +
    `  -> liat semua nama stiker dan jumlahnya`

const sleep = ms => new Promise(r => setTimeout(r, ms))

const toBase64 = v => {
    if (!v) return undefined
    return Buffer.isBuffer(v) ? v.toString("base64") : Buffer.from(v).toString("base64")
}

const toStrNum = v => {
    if (v === undefined || v === null) return undefined
    return typeof v?.toString === "function" ? v.toString() : String(v)
}

const B = v => (Buffer.isBuffer(v) || v instanceof Uint8Array) ? v : Buffer.from(v, "base64")

const fmtList = list => list.map(s => `- ${s.name} (${s.count})`).join("\n")

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, q, sock, jid, text, isOwner } = ctx
    if (!isOwner) return

    const trimmed = (text || "").trim()
    const subcommand = trimmed.split(/\s+/)[0]?.toLowerCase()
    const arg = trimmed.slice(subcommand?.length || 0).trim()

    if (subcommand === "add") {
        const stickerMsg = q?.message?.stickerMessage
        if (!stickerMsg) return await m.arashirep("reply ke stiker dulu buat di-add")

        const entry = {
            url: stickerMsg.url,
            fileSha256: toBase64(stickerMsg.fileSha256),
            fileEncSha256: toBase64(stickerMsg.fileEncSha256),
            mediaKey: toBase64(stickerMsg.mediaKey),
            mimetype: stickerMsg.mimetype,
            height: stickerMsg.height,
            width: stickerMsg.width,
            directPath: stickerMsg.directPath,
            fileLength: toStrNum(stickerMsg.fileLength),
            mediaKeyTimestamp: toStrNum(stickerMsg.mediaKeyTimestamp),
            isAnimated: !!stickerMsg.isAnimated,
            isAvatar: !!stickerMsg.isAvatar,
            isAiSticker: !!stickerMsg.isAiSticker,
            isLottie: !!stickerMsg.isLottie,
            firstFrameLength: stickerMsg.firstFrameLength,
            firstFrameSidecar: toBase64(stickerMsg.firstFrameSidecar)
        }

        const result = reactStickerManager.add(arg, entry)
        const list = reactStickerManager.list()
        return await m.arashirep(`${result.message}\n\nstiker tersedia:\n${fmtList(list)}`)
    }

    if (subcommand === "del" || subcommand === "delete" || subcommand === "remove") {
        const [name, idxRaw] = arg.split(/\s+/)
        if (!name) return await m.arashirep("kasih nama stikernya, contoh: *rstc del nama* atau *rstc del nama 2*")
        const index = idxRaw ? parseInt(idxRaw, 10) : undefined
        const result = reactStickerManager.remove(name, index)
        return await m.arashirep(result.message)
    }

    if (subcommand === "list") {
        const list = reactStickerManager.list()
        if (!list.length) return await m.arashirep("belum ada stiker. tambahin dulu pake *rstc add [nama]* ( reply stiker )")
        return await m.arashirep(`stiker tersedia:\n${fmtList(list)}`)
    }

    if (!q) return await m.arashirep(HELP_TEXT)

    const parts = trimmed.split(/\s+/).filter(Boolean)
    let count = SPAM_COUNT_DEFAULT
    if (parts.length && /^\d+$/.test(parts[parts.length - 1])) {
        count = parseInt(parts.pop(), 10)
    }
    count = Math.min(Math.max(count, 1), SPAM_COUNT_MAX)
    const name = parts.join(" ") || "default"

    if (!reactStickerManager.exists(name)) {
        const list = reactStickerManager.list()
        return await m.arashirep(
            `stiker *${name}* belum ke daftar.\n` +
            (list.length ? `stiker tersedia:\n${fmtList(list)}` : `belum ada stiker sama sekali, tambahin dulu pake *rstc add [nama]* ( reply stiker )`)
        )
    }

    const target = {
        remoteJid: q.key.remoteJid,
        fromMe: q.key.fromMe,
        id: q.key.id,
        participant: isJidGroup(q.key.remoteJid) ? q.key.participant : undefined
    }

    for (let i = 0; i < count; i++) {
        const sticker = reactStickerManager.get(name)
        const stickerContent = {
            url: sticker.url,
            fileSha256: B(sticker.fileSha256),
            fileEncSha256: B(sticker.fileEncSha256),
            mediaKey: B(sticker.mediaKey),
            mimetype: sticker.mimetype,
            height: sticker.height,
            width: sticker.width,
            directPath: sticker.directPath,
            fileLength: sticker.fileLength,
            mediaKeyTimestamp: sticker.mediaKeyTimestamp,
            isAnimated: sticker.isAnimated,
            isAvatar: sticker.isAvatar,
            isAiSticker: sticker.isAiSticker,
            isLottie: sticker.isLottie,
            ...(sticker.firstFrameLength !== undefined && { firstFrameLength: sticker.firstFrameLength }),
            ...(sticker.firstFrameSidecar && { firstFrameSidecar: B(sticker.firstFrameSidecar) })
        }

        await sock.relayMessage(jid, {
            stickerMessage: stickerContent,
            messageContextInfo: {
                messageAssociation: { associationType: 11, parentMessageKey: target },
                messageSecret: crypto.randomBytes(32)
            }
        }, {})
        await sleep(SPAM_DELAY_MS)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "react sticker",
    commands: ["rstc"],
    categories: ["tools"],
    description: HELP_TEXT
}

plugin.meta = {
    filename: "rstc.js",
    version: "2.1.0",
    author: config.devName,
    note: "support stiker animated (firstFrameLength/firstFrameSidecar + messageSecret biar gerak), satu nama bisa nampung banyak stiker acak",
    path: "tools"
}

export default plugin
