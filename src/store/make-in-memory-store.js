/**
 * makeInMemoryStore - Upgrade Persisten SQLite + In-Memory Cache
 * Menyimpan seluruh pesan yang dikirim/diterima secara permanen di SQLite (data/messagestore.db)
 * Mendukung pencatatan pesan yang dihapus (anti-delete) sehingga pesan yang ditarik/dihapus
 * tetap tersimpan dan bisa di-restore kapan saja.
 *
 * @import {BaileysEventMap, WAMessage, WAMessageKey, proto} from "baileys"
 */

import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { getContentType } from "baileys"

const DATA_DIR = path.join(process.cwd(), "data")
fs.mkdirSync(DATA_DIR, { recursive: true })

const DB_PATH = path.join(DATA_DIR, "messagestore.db")
const db = new DatabaseSync(DB_PATH)
db.exec("PRAGMA journal_mode = WAL")
db.exec("PRAGMA synchronous = NORMAL")
db.exec("PRAGMA busy_timeout = 5000")

db.exec(`
    CREATE TABLE IF NOT EXISTS stored_messages (
        jid TEXT NOT NULL,
        id TEXT NOT NULL,
        sender TEXT DEFAULT '',
        from_me INTEGER DEFAULT 0,
        timestamp INTEGER DEFAULT 0,
        content_type TEXT DEFAULT '',
        text TEXT DEFAULT '',
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER DEFAULT 0,
        raw_json TEXT NOT NULL,
        PRIMARY KEY (jid, id)
    );
    CREATE INDEX IF NOT EXISTS idx_sm_jid_time ON stored_messages(jid, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_sm_jid_deleted ON stored_messages(jid, is_deleted, deleted_at DESC);
`)

const insertOrUpdateStmt = db.prepare(`
    INSERT INTO stored_messages (jid, id, sender, from_me, timestamp, content_type, text, is_deleted, deleted_at, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(jid, id) DO UPDATE SET
        sender = excluded.sender,
        content_type = CASE WHEN excluded.content_type != '' THEN excluded.content_type ELSE stored_messages.content_type END,
        text = CASE WHEN excluded.text != '' THEN excluded.text ELSE stored_messages.text END,
        raw_json = excluded.raw_json
`)

const markDeletedStmt = db.prepare(`
    UPDATE stored_messages
    SET is_deleted = 1, deleted_at = ?
    WHERE jid = ? AND id = ?
`)

const selectOneStmt = db.prepare(`
    SELECT * FROM stored_messages WHERE jid = ? AND id = ?
`)

const selectLastDeletedStmt = db.prepare(`
    SELECT * FROM stored_messages
    WHERE jid = ? AND is_deleted = 1
    ORDER BY deleted_at DESC, timestamp DESC
    LIMIT 1
`)

const selectRecentDeletedStmt = db.prepare(`
    SELECT * FROM stored_messages
    WHERE jid = ? AND is_deleted = 1
    ORDER BY deleted_at DESC, timestamp DESC
    LIMIT ?
`)

function safeStringify(obj) {
    try {
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === "bigint") return value.toString()
            return value
        })
    } catch {
        return "{}"
    }
}

function extractText(WAM) {
    if (!WAM?.message) return ""
    try {
        const ct = getContentType(WAM.message)
        const msg = WAM.message[ct]
        return String(
            WAM.message.conversation ||
            msg?.text ||
            msg?.caption ||
            msg?.message?.documentMessage?.caption ||
            msg?.message?.imageMessage?.caption ||
            msg?.message?.videoMessage?.caption ||
            msg?.body?.text ||
            ""
        ).trim()
    } catch {
        return ""
    }
}

/**
 * @typedef {object} MakeInMemoryStoreOptions
 * @property {import("pino").Logger} [logger]
 * @property {number} [maxMessagesPerChat] batas jumlah pesan di memory per chat. default 300
 */

/**
 * @param {MakeInMemoryStoreOptions} options
 */
function makeInMemoryStore(options = {}) {
    const { logger, maxMessagesPerChat = 300 } = options

    /** @type {Map<string, Map<string, WAMessage>>} jid -> (messageId -> WAMessage) */
    const messagesByChat = new Map()

    /** @type {Map<string, WAMessage[]>} jid -> list pesan yang baru saja dihapus */
    const recentDeletedByChat = new Map()

    function getChatMap(jid) {
        let chatMap = messagesByChat.get(jid)
        if (!chatMap) {
            chatMap = new Map()
            messagesByChat.set(jid, chatMap)
        }
        return chatMap
    }

    function recordDeleted(jid, id, deletedAt = Math.floor(Date.now() / 1000)) {
        if (!jid || !id) return
        markDeletedStmt.run(deletedAt, jid, id)

        const chatMap = getChatMap(jid)
        const cached = chatMap.get(id)
        if (cached) {
            cached.isDeleted = true
            cached.deletedAt = deletedAt
        }

        let delList = recentDeletedByChat.get(jid)
        if (!delList) {
            delList = []
            recentDeletedByChat.set(jid, delList)
        }

        const msgToSave = cached || getMessageSync(jid, id)
        if (msgToSave) {
            msgToSave.isDeleted = true
            msgToSave.deletedAt = deletedAt
            delList.unshift(msgToSave)
            if (delList.length > 50) delList.pop()
        }
    }

    /**
     * @param {WAMessage} WAM
     */
    function upsertMessage(WAM) {
        const jid = WAM?.key?.remoteJid
        const id = WAM?.key?.id
        if (!jid || !id) return

        // Cek apakah pesan ini adalah REVOKE protocol message (permintaan hapus pesan)
        const protoMsg = WAM?.message?.protocolMessage
        if (protoMsg && (protoMsg.type === 0 || protoMsg.type === "REVOKE") && protoMsg.key?.id) {
            recordDeleted(protoMsg.key.remoteJid || jid, protoMsg.key.id)
            return
        }

        const chatMap = getChatMap(jid)
        const existing = chatMap.get(id)
        const merged = existing ? { ...existing, ...WAM } : WAM
        chatMap.set(id, merged)

        if (maxMessagesPerChat && chatMap.size > maxMessagesPerChat) {
            const oldestKey = chatMap.keys().next().value
            chatMap.delete(oldestKey)
        }

        // Simpan permanen ke database SQLite
        try {
            const sender = WAM?.key?.participant || WAM?.participant || (WAM?.key?.fromMe ? "bot" : jid)
            const fromMe = WAM?.key?.fromMe ? 1 : 0
            const timestamp = Number(WAM?.messageTimestamp?.low || WAM?.messageTimestamp || Math.floor(Date.now() / 1000))
            const ct = getContentType(WAM?.message) || ""
            const text = extractText(WAM)
            const rawJson = safeStringify(merged)

            insertOrUpdateStmt.run(jid, id, sender, fromMe, timestamp, ct, text, 0, 0, rawJson)
        } catch (e) {
            console.error(`[messagestore] upsert sqlite error:`, e)
        }
    }

    /**
     * @param {WAMessageKey} key
     * @param {Partial<WAMessage>} update
     */
    function updateMessage(key, update) {
        const jid = key?.remoteJid
        const id = key?.id
        if (!jid || !id) return

        const chatMap = getChatMap(jid)
        const existing = chatMap.get(id) || getMessageSync(jid, id)
        if (existing) {
            const merged = { ...existing, ...update }
            chatMap.set(id, merged)
            try {
                const rawJson = safeStringify(merged)
                db.prepare("UPDATE stored_messages SET raw_json = ? WHERE jid = ? AND id = ?").run(rawJson, jid, id)
            } catch {}
        }
    }

    /**
     * Handler saat pesan dihapus untuk semua orang
     * JANGAN DIHAPUS DARI DATABASE! Kita tandai is_deleted = 1 agar bisa di-restore!
     * @param {WAMessageKey} key
     */
    function deleteMessage(key) {
        const jid = key?.remoteJid
        const id = key?.id
        if (!jid || !id) return
        recordDeleted(jid, id)
    }

    /**
     * @param {BaileysEventMap} ev
     */
    function bind(ev) {
        if (ev['messages.upsert']) {
            const { messages } = ev['messages.upsert']
            for (const WAM of messages || []) {
                upsertMessage(WAM)
            }
        }

        if (ev['messages.update']) {
            for (const { key, update } of ev['messages.update'] || []) {
                updateMessage(key, update)
            }
        }

        if (ev['messages.delete']) {
            const item = ev['messages.delete']
            if (item && 'keys' in item) {
                for (const key of item.keys) deleteMessage(key)
            }
        }
    }

    /**
     * Ambil pesan dari cache atau SQLite secara asynchronous
     * @param {string} jid
     * @param {string} id
     * @returns {Promise<WAMessage|undefined>}
     */
    async function loadMessage(jid, id) {
        return getMessageSync(jid, id)
    }

    /**
     * Ambil pesan secara synchronous (cek memory -> cek SQLite sync)
     * @param {string} jid
     * @param {string} id
     * @returns {WAMessage|undefined}
     */
    function getMessageSync(jid, id) {
        if (!jid || !id) return undefined
        const chatMap = getChatMap(jid)
        const cached = chatMap.get(id)
        if (cached) return cached

        try {
            const row = selectOneStmt.get(jid, id)
            if (row?.raw_json) {
                const parsed = JSON.parse(row.raw_json)
                if (row.is_deleted) {
                    parsed.isDeleted = true
                    parsed.deletedAt = row.deleted_at
                }
                chatMap.set(id, parsed)
                return parsed
            }
        } catch (e) {
            console.error("[messagestore] getMessageSync error:", e)
        }
        return undefined
    }

    /**
     * Ambil pesan terakhir yang dihapus di chat ini
     * @param {string} jid
     * @returns {WAMessage|undefined}
     */
    function getLastDeletedMessage(jid) {
        if (!jid) return undefined
        const recent = recentDeletedByChat.get(jid)
        if (recent && recent.length) {
            return recent[0]
        }

        try {
            const row = selectLastDeletedStmt.get(jid)
            if (row?.raw_json) {
                const parsed = JSON.parse(row.raw_json)
                parsed.isDeleted = true
                parsed.deletedAt = row.deleted_at
                return parsed
            }
        } catch (e) {
            console.error("[messagestore] getLastDeletedMessage error:", e)
        }
        return undefined
    }

    /**
     * Ambil daftar pesan yang dihapus di chat ini
     * @param {string} jid
     * @param {number} limit
     * @returns {WAMessage[]}
     */
    function getDeletedMessages(jid, limit = 10) {
        if (!jid) return []
        try {
            const rows = selectRecentDeletedStmt.all(jid, limit)
            return rows.map((r) => {
                const parsed = JSON.parse(r.raw_json)
                parsed.isDeleted = true
                parsed.deletedAt = r.deleted_at
                return parsed
            })
        } catch {
            return []
        }
    }

    logger?.info?.(`[make-in-memory-store] siap dengan SQLite persisten & anti-delete, maxMessagesPerChat=${maxMessagesPerChat}`)

    return {
        bind,
        loadMessage,
        getMessageSync,
        getLastDeletedMessage,
        getDeletedMessages,
        deleteMessage,
        messagesByChat,
        db
    }
}

const messageStore = makeInMemoryStore({ maxMessagesPerChat: 300 })

export { makeInMemoryStore, messageStore }
