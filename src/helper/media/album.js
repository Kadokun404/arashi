import { messageStore } from "#store/make-in-memory-store.js"

export function normSender(s) {
    if (!s) return ""
    return String(s).split(":")[0].split("@")[0].replace(/[^0-9]/g, "")
}

export function toSeconds(ts) {
    if (!ts) return 0
    if (typeof ts === "object" && "low" in ts) ts = ts.low
    ts = Number(ts)
    if (ts > 1e11) ts = Math.floor(ts / 1000)
    return ts
}

export function extractMediaInfo(wam) {
    if (!wam) return null
    const msg = wam.message || wam
    const realMsg = msg?.viewOnceMessage?.message ||
                    msg?.viewOnceMessageV2?.message ||
                    msg?.viewOnceMessageV2Extension?.message ||
                    msg

    if (realMsg?.imageMessage) {
        return { type: "imageMessage", isVideo: false, media: realMsg.imageMessage }
    }
    if (realMsg?.videoMessage) {
        return { type: "videoMessage", isVideo: true, media: realMsg.videoMessage }
    }
    if (realMsg?.stickerMessage) {
        return { type: "stickerMessage", isVideo: false, media: realMsg.stickerMessage }
    }
    return null
}

/**
 * Mencari semua item media yang terhubung dalam satu Album
 * Mendukung Native WhatsApp Album Association & Heuristic Timestamp Clustering
 */
export async function findAlbumMedia(target, chatJid) {
    const targetId = target?.key?.id
    if (!targetId || !chatJid) return []

    // 1. Dapatkan target WAMessage lengkap & metadata dari SQLite / Memory
    let targetWam = target?.fullMessage || (target.message ? target : null)
    let targetRow = null

    if (messageStore?.db) {
        try {
            targetRow = messageStore.db.prepare(
                "SELECT * FROM stored_messages WHERE jid = ? AND id = ?"
            ).get(chatJid, targetId)
            if (targetRow?.raw_json && !targetWam) {
                targetWam = JSON.parse(targetRow.raw_json)
            }
        } catch (e) {
            console.error("[album] db get target error:", e)
        }
    }

    if (!targetWam && messageStore?.getMessageSync) {
        targetWam = messageStore.getMessageSync(chatJid, targetId)
    }

    const targetSender = normSender(
        target?.sender ||
        target?.contact?.lid ||
        target?.contact?.pn ||
        target?.key?.participant ||
        targetRow?.sender ||
        targetWam?.key?.participant ||
        targetWam?.participant
    )

    let targetTs = toSeconds(
        targetRow?.timestamp ||
        targetWam?.messageTimestamp ||
        target?.messageTimestamp ||
        target?.timestamp
    )

    // 2. METODE 1: Cek WhatsApp Native Album Association (parentMessageKey)
    let parentId = null
    const checkMsg = targetWam?.message || target?.message
    if (checkMsg?.albumMessage || target?.content === "albumMessage") {
        parentId = targetId
    } else {
        const assoc = checkMsg?.messageContextInfo?.messageAssociation ||
                      checkMsg?.imageMessage?.contextInfo?.messageAssociation ||
                      checkMsg?.videoMessage?.contextInfo?.messageAssociation ||
                      targetWam?.messageContextInfo?.messageAssociation
        if (assoc?.parentMessageKey?.id) {
            parentId = assoc.parentMessageKey.id
        }
    }

    const candidatesMap = new Map()

    if (parentId && messageStore?.db) {
        try {
            const rows = messageStore.db.prepare(`
                SELECT * FROM stored_messages
                WHERE jid = ? AND is_deleted = 0
                ORDER BY timestamp ASC, rowid ASC
            `).all(chatJid)

            for (const r of rows) {
                try {
                    const parsed = JSON.parse(r.raw_json)
                    const parsedAssoc = parsed.message?.messageContextInfo?.messageAssociation ||
                                        parsed.message?.imageMessage?.contextInfo?.messageAssociation ||
                                        parsed.message?.videoMessage?.contextInfo?.messageAssociation
                    const isAssociated = parsedAssoc?.parentMessageKey?.id === parentId || r.id === parentId
                    if (isAssociated) {
                        const mediaInfo = extractMediaInfo(parsed)
                        if (mediaInfo) {
                            candidatesMap.set(r.id, {
                                id: r.id,
                                wam: parsed,
                                isVideo: mediaInfo.isVideo,
                                timestamp: r.timestamp
                            })
                        }
                    }
                } catch {}
            }
        } catch (e) {
            console.error("[album] native assoc query error:", e)
        }

        if (candidatesMap.size >= 2) {
            return Array.from(candidatesMap.values())
        }
    }

    // 3. METODE 2: Cluster Detection berdasarkan Waktu & Pengirim (Burst Heuristic)
    if (targetTs > 0 && messageStore?.db) {
        try {
            const rows = messageStore.db.prepare(`
                SELECT * FROM stored_messages
                WHERE jid = ? 
                  AND is_deleted = 0
                  AND content_type IN ('imageMessage', 'videoMessage')
                  AND timestamp BETWEEN ? AND ?
                ORDER BY timestamp ASC, rowid ASC
            `).all(chatJid, targetTs - 6, targetTs + 6)

            const memMap = messageStore.messagesByChat?.get(chatJid)
            const allWams = []

            for (const r of rows) {
                try {
                    const parsed = JSON.parse(r.raw_json)
                    allWams.push({
                        id: r.id,
                        sender: r.sender,
                        timestamp: r.timestamp,
                        wam: parsed
                    })
                } catch {}
            }

            if (memMap) {
                for (const [mid, memMsg] of memMap.entries()) {
                    if (!allWams.some((x) => x.id === mid)) {
                        const mTs = toSeconds(memMsg.messageTimestamp)
                        if (Math.abs(mTs - targetTs) <= 6) {
                            allWams.push({
                                id: mid,
                                sender: memMsg.key?.participant || memMsg.participant || "",
                                timestamp: mTs,
                                wam: memMsg
                            })
                        }
                    }
                }
            }

            const matchingSenderMedia = allWams.filter((item) => {
                const s = normSender(item.sender || item.wam.key?.participant || item.wam.participant)
                if (targetSender && s && targetSender !== s) return false
                const mediaInfo = extractMediaInfo(item.wam)
                return Boolean(mediaInfo)
            })

            matchingSenderMedia.sort((a, b) => a.timestamp - b.timestamp)

            const clusters = []
            let currentCluster = []

            for (let i = 0; i < matchingSenderMedia.length; i++) {
                const cur = matchingSenderMedia[i]
                if (currentCluster.length === 0) {
                    currentCluster.push(cur)
                } else {
                    const prev = currentCluster[currentCluster.length - 1]
                    if (Math.abs(cur.timestamp - prev.timestamp) <= 3) {
                        currentCluster.push(cur)
                    } else {
                        clusters.push(currentCluster)
                        currentCluster = [cur]
                    }
                }
            }
            if (currentCluster.length > 0) {
                clusters.push(currentCluster)
            }

            for (const cluster of clusters) {
                const containsTarget = cluster.some((item) => item.id === targetId)
                if (containsTarget && cluster.length >= 2) {
                    return cluster.map((item) => {
                        const mediaInfo = extractMediaInfo(item.wam)
                        return {
                            id: item.id,
                            wam: item.wam,
                            isVideo: mediaInfo?.isVideo || false,
                            timestamp: item.timestamp
                        }
                    })
                }
            }

            for (const cluster of clusters) {
                const closeToTarget = cluster.some((item) => Math.abs(item.timestamp - targetTs) <= 2)
                if (closeToTarget && cluster.length >= 2) {
                    return cluster.map((item) => {
                        const mediaInfo = extractMediaInfo(item.wam)
                        return {
                            id: item.id,
                            wam: item.wam,
                            isVideo: mediaInfo?.isVideo || false,
                            timestamp: item.timestamp
                        }
                    })
                }
            }
        } catch (e) {
            console.error("[album] cluster heuristic error:", e)
        }
    }

    return []
}

/**
 * Mengirim kumpulan media sebagai album WhatsApp resmi (Native Album)
 * @param {import("baileys").WASocket} sock
 * @param {string} jid
 * @param {Array<Buffer|{buffer: Buffer, caption?: string}>} items
 * @param {any} [quoted]
 */
export async function sendAlbum(sock, jid, items, quoted = null) {
    if (!items || !items.length) return
    if (items.length === 1) {
        const first = items[0]
        const buf = Buffer.isBuffer(first) ? first : first.buffer
        const cap = Buffer.isBuffer(first) ? undefined : first.caption
        return await sock.sendMessage(jid, {
            image: buf,
            caption: cap
        }, quoted ? { quoted } : {})
    }

    // 1. Kirim parent albumMessage container
    const parentMsg = await sock.sendMessage(jid, {
        album: {
            expectedImageCount: items.length,
            expectedVideoCount: 0
        }
    }, quoted ? { quoted } : {})

    // 2. Kirim setiap media dengan mengaitkan albumParentKey
    for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const buf = Buffer.isBuffer(item) ? item : item.buffer
        const cap = Buffer.isBuffer(item) ? undefined : item.caption

        await sock.sendMessage(jid, {
            image: buf,
            caption: cap,
            albumParentKey: parentMsg.key
        })
    }

    return parentMsg
}

export default {
    normSender,
    toSeconds,
    extractMediaInfo,
    findAlbumMedia,
    sendAlbum
}
