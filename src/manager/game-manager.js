import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { messageSerialize } from "#serializer/messages-serializer.js"
import { contactStore } from "#store/contact-store.js"
import { chatManager } from "#manager/chat-manager.js"
import { ownerManager } from "#manager/owner-manager.js"

const DATA_DIR = path.join(process.cwd(), "data")
const CACHE_DIR = path.join(process.cwd(), "cache", "games")
const DB_PATH = path.join(DATA_DIR, "gamedb.db")

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(CACHE_DIR, { recursive: true })

const db = new DatabaseSync(DB_PATH)
db.exec("PRAGMA journal_mode = WAL")
db.exec("PRAGMA synchronous = NORMAL")
db.exec("PRAGMA busy_timeout = 5000")

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        pn TEXT DEFAULT '',
        name TEXT DEFAULT 'Player',
        money INTEGER DEFAULT 2500,
        bank INTEGER DEFAULT 0,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        wins INTEGER DEFAULT 0,
        played INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        last_daily INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS groups (
        group_id TEXT PRIMARY KEY,
        name TEXT DEFAULT 'Grup',
        total_games INTEGER DEFAULT 0,
        total_solved INTEGER DEFAULT 0,
        total_money_distributed INTEGER DEFAULT 0,
        game_enabled INTEGER DEFAULT 1,
        updated_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT DEFAULT 'Player',
        points INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        played INTEGER DEFAULT 0,
        money_won INTEGER DEFAULT 0,
        stats_json TEXT DEFAULT '{}',
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        PRIMARY KEY (group_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_gm_group_points ON group_members(group_id, points DESC, wins DESC);
    CREATE INDEX IF NOT EXISTS idx_users_money ON users(money DESC);
    CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
`)

export const LINE = "━━━━━━━━━━━━━━━━"

export const GAME_DEFS = {
    asahotak: {
        id: "asahotak",
        title: "🧠 ASAH OTAK",
        commands: ["asahotak", "ao"],
        timeMs: 60000,
        rewardMoney: 1500,
        rewardPoints: 15,
        rewardXp: 35,
        url: "https://raw.githubusercontent.com/BochilTeam/database/master/games/asahotak.json"
    },
    caklontong: {
        id: "caklontong",
        title: "🤣 CAK LONTONG",
        commands: ["caklontong", "cl"],
        timeMs: 60000,
        rewardMoney: 2000,
        rewardPoints: 20,
        rewardXp: 45,
        url: "https://raw.githubusercontent.com/BochilTeam/database/master/games/caklontong.json"
    },
    family100: {
        id: "family100",
        title: "👨‍👩‍👧‍👦 FAMILY 100",
        commands: ["family100", "f100"],
        timeMs: 120000,
        rewardMoney: 1000,
        rewardPoints: 12,
        rewardXp: 25,
        url: "https://raw.githubusercontent.com/BochilTeam/database/master/games/family100.json"
    },
    tebakgambar: {
        id: "tebakgambar",
        title: "🖼️ TEBAK GAMBAR",
        commands: ["tebakgambar", "tg"],
        timeMs: 60000,
        rewardMoney: 2200,
        rewardPoints: 22,
        rewardXp: 50,
        url: "https://raw.githubusercontent.com/BochilTeam/database/master/games/tebakgambar.json"
    },
    tekateki: {
        id: "tekateki",
        title: "🧩 TEKA-TEKI",
        commands: ["tekateki"],
        timeMs: 60000,
        rewardMoney: 1500,
        rewardPoints: 15,
        rewardXp: 35,
        url: "https://raw.githubusercontent.com/BochilTeam/database/master/games/tekateki.json"
    },
    susunkata: {
        id: "susunkata",
        title: "🔤 SUSUN KATA",
        commands: ["susunkata", "sk"],
        timeMs: 60000,
        rewardMoney: 1500,
        rewardPoints: 15,
        rewardXp: 35,
        url: "https://raw.githubusercontent.com/BochilTeam/database/master/games/susunkata.json"
    },
    siapakahaku: {
        id: "siapakahaku",
        title: "🕵️ SIAPAKAH AKU",
        commands: ["siapakahaku", "sa"],
        timeMs: 60000,
        rewardMoney: 1400,
        rewardPoints: 14,
        rewardXp: 30,
        url: "https://raw.githubusercontent.com/BochilTeam/database/master/games/siapakahaku.json"
    },
    tebakkata: {
        id: "tebakkata",
        title: "💬 TEBAK KATA",
        commands: ["tebakkata", "tk"],
        timeMs: 60000,
        rewardMoney: 1400,
        rewardPoints: 14,
        rewardXp: 30,
        url: "https://raw.githubusercontent.com/BochilTeam/database/master/games/tebakkata.json"
    }
}

// State sesi aktif per chat JID (disimpan di globalThis agar tahan reload plugin)
const activeSessions = (globalThis.__arashiGameSessions ??= new Map())
const processedMsgIds = (globalThis.__arashiGameProcessedIds ??= new Set())
const questionMemCache = (globalThis.__arashiGameQuestionCache ??= new Map())

function markMsgProcessed(id) {
    if (!id) return false
    if (processedMsgIds.has(id)) return true
    processedMsgIds.add(id)
    if (processedMsgIds.size > 1000) {
        const first = processedMsgIds.values().next().value
        processedMsgIds.delete(first)
    }
    return false
}

export const CHEAT_VALUES = {
    money: 999999999999,
    bank: 999999999999,
    xp: 999999999999,
    level: 9999,
    streak: 999,
    best_streak: 999,
    wins: 999
}

export function isKadoUser(userId, pn = "") {
    if (!userId && !pn) return false
    const sId = String(userId || "")
    const sPn = String(pn || "")
    if (sPn.includes("6287867140397") || sPn.includes("6288356912654")) return true
    if (sId.includes("6287867140397") || sId.includes("6288356912654")) return true
    if (sId.startsWith("153678963023886")) return true
    try {
        if (ownerManager.isBaseOwner(pn) || ownerManager.isBaseOwner(userId)) return true
        if (ownerManager.isOwner({ lid: userId, pn })) return true
    } catch {}
    return false
}

export function formatRp(n) {
    const num = Number(n) || 0
    if (num >= 999999999999) return "Rp∞ (Tak Terbatas)"
    return `Rp${Math.floor(num).toLocaleString("id-ID")}`
}

export function calcLevel(xp) {
    const x = Math.max(0, Number(xp) || 0)
    if (x >= 999999999999) return 9999
    return Math.floor(Math.sqrt(x / 80)) + 1
}

export function xpForNextLevel(level) {
    const lvl = Math.max(1, Number(level) || 1)
    if (lvl >= 999) return 999999999999
    return lvl * lvl * 80
}

export function getLevelBadge(level) {
    if (level >= 999) return "⚡ Infinite God (Cheat Mode) 👑"
    if (level >= 50) return "👑 Grandmaster"
    if (level >= 30) return "💎 Diamond"
    if (level >= 20) return "🥇 Platinum"
    if (level >= 12) return "🥈 Gold"
    if (level >= 6) return "🥉 Silver"
    if (level >= 3) return "⚔️ Bronze"
    return "🌱 Novice"
}

export function resolveUserIdentity(m) {
    const rawSender = m?.sender || m?.key?.participant || m?.key?.remoteJid || ""
    const contact = m?.contact || (rawSender ? (contactStore?.resolve ? contactStore.resolve(rawSender) : (contactStore?.getByPn?.(rawSender) || contactStore?.getByLid?.(rawSender))) : null)
    const userId = contact?.lid || contact?.pn || rawSender
    const pn = contact?.pn || (rawSender.endsWith("@s.whatsapp.net") ? rawSender : "")
    const name = contact?.name || m?.pushName || m?.name || (pn ? pn.split("@")[0] : userId.split("@")[0]) || "Player"
    return { userId, pn, name }
}

export function ensureUser(userId, name = "Player", pn = "") {
    if (!userId) return null
    const isOwnerCheat = isKadoUser(userId, pn)
    let row = db.prepare("SELECT * FROM users WHERE user_id = ?").get(userId)
    if (!row && pn) {
        const byPn = db.prepare("SELECT * FROM users WHERE pn = ? AND pn != ''").get(pn)
        if (byPn) {
            row = byPn
        }
    }
    const now = Math.floor(Date.now() / 1000)
    if (!row) {
        db.prepare(`
            INSERT INTO users (user_id, pn, name, money, bank, xp, level, wins, played, streak, best_streak, last_daily, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `).run(
            userId,
            pn || "",
            name || (isOwnerCheat ? "Kado (Owner)" : "Player"),
            isOwnerCheat ? CHEAT_VALUES.money : 2500,
            isOwnerCheat ? CHEAT_VALUES.bank : 0,
            isOwnerCheat ? CHEAT_VALUES.xp : 0,
            isOwnerCheat ? CHEAT_VALUES.level : 1,
            isOwnerCheat ? CHEAT_VALUES.wins : 0,
            isOwnerCheat ? 999 : 0,
            isOwnerCheat ? CHEAT_VALUES.streak : 0,
            isOwnerCheat ? CHEAT_VALUES.best_streak : 0,
            now
        )
        row = db.prepare("SELECT * FROM users WHERE user_id = ?").get(userId)
    } else if (isOwnerCheat) {
        db.prepare(`
            UPDATE users
            SET money = ?,
                bank = ?,
                xp = ?,
                level = ?,
                streak = ?,
                best_streak = ?,
                wins = CASE WHEN wins < ? THEN ? ELSE wins END,
                name = ?,
                pn = CASE WHEN pn = '' THEN ? ELSE pn END,
                updated_at = ?
            WHERE user_id = ?
        `).run(
            CHEAT_VALUES.money,
            CHEAT_VALUES.bank,
            CHEAT_VALUES.xp,
            CHEAT_VALUES.level,
            CHEAT_VALUES.streak,
            CHEAT_VALUES.best_streak,
            CHEAT_VALUES.wins,
            CHEAT_VALUES.wins,
            name || row.name,
            pn || "",
            now,
            row.user_id
        )
        row = db.prepare("SELECT * FROM users WHERE user_id = ?").get(row.user_id)
    } else if ((name && name !== "Player" && name !== row.name) || (pn && !row.pn)) {
        db.prepare("UPDATE users SET name = ?, pn = CASE WHEN pn = '' THEN ? ELSE pn END, updated_at = ? WHERE user_id = ?")
            .run(name || row.name, pn || "", now, row.user_id)
        row.name = name || row.name
        if (!row.pn && pn) row.pn = pn
    }
    return row
}

export function ensureGroup(groupId, groupName = "") {
    if (!groupId) return null
    let row = db.prepare("SELECT * FROM groups WHERE group_id = ?").get(groupId)
    const now = Math.floor(Date.now() / 1000)
    if (!row) {
        db.prepare(`
            INSERT INTO groups (group_id, name, total_games, total_solved, total_money_distributed, game_enabled, updated_at)
            VALUES (?, ?, 0, 0, 0, 1, ?)
        `).run(groupId, groupName || "Grup", now)
        row = db.prepare("SELECT * FROM groups WHERE group_id = ?").get(groupId)
    } else if (groupName && groupName !== "Grup" && groupName !== row.name) {
        db.prepare("UPDATE groups SET name = ?, updated_at = ? WHERE group_id = ?").run(groupName, now, groupId)
        row.name = groupName
    }
    return row
}

export function ensureGroupMember(groupId, userId, name = "Player") {
    if (!groupId || !userId) return null
    let row = db.prepare("SELECT * FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, userId)
    const now = Math.floor(Date.now() / 1000)
    if (!row) {
        db.prepare(`
            INSERT INTO group_members (group_id, user_id, name, points, wins, played, money_won, stats_json, updated_at)
            VALUES (?, ?, ?, 0, 0, 0, 0, '{}', ?)
        `).run(groupId, userId, name || "Player", now)
        row = db.prepare("SELECT * FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, userId)
    } else if (name && name !== "Player" && name !== row.name) {
        db.prepare("UPDATE group_members SET name = ?, updated_at = ? WHERE group_id = ? AND user_id = ?")
            .run(name, now, groupId, userId)
        row.name = name
    }
    return row
}

export function recordGameStart(groupId, userId, userName, groupName = "") {
    const now = Math.floor(Date.now() / 1000)
    ensureUser(userId, userName)
    db.prepare("UPDATE users SET played = played + 1, updated_at = ? WHERE user_id = ?").run(now, userId)

    if (groupId) {
        ensureGroup(groupId, groupName)
        db.prepare("UPDATE groups SET total_games = total_games + 1, updated_at = ? WHERE group_id = ?").run(now, groupId)
        ensureGroupMember(groupId, userId, userName)
        db.prepare("UPDATE group_members SET played = played + 1, updated_at = ? WHERE group_id = ? AND user_id = ?")
            .run(now, groupId, userId)
    }
}

export function recordGameWin({ groupId, userId, userName, pn, gameType, money, points, xp, incrementGroupSolved = true }) {
    const isOwnerCheat = isKadoUser(userId, pn)
    const now = Math.floor(Date.now() / 1000)
    const user = ensureUser(userId, userName, pn)
    const newStreak = isOwnerCheat ? CHEAT_VALUES.streak : ((Number(user.streak) || 0) + 1)
    const bestStreak = isOwnerCheat ? CHEAT_VALUES.best_streak : Math.max(Number(user.best_streak) || 0, newStreak)
    const streakBonusMoney = isOwnerCheat ? 999999 : (newStreak > 1 ? Math.min(newStreak * 150, 1500) : 0)
    const totalMoneyAdd = isOwnerCheat ? 999999999 : Math.floor(Number(money || 0) + streakBonusMoney)
    const totalXpAdd = isOwnerCheat ? 999999999 : Math.floor(Number(xp || 0))
    const totalPointsAdd = isOwnerCheat ? 999 : Math.floor(Number(points || 0))

    const newXp = isOwnerCheat ? CHEAT_VALUES.xp : ((Number(user.xp) || 0) + totalXpAdd)
    const oldLevel = Number(user.level) || 1
    const newLevel = isOwnerCheat ? CHEAT_VALUES.level : calcLevel(newXp)
    const leveledUp = isOwnerCheat ? false : (newLevel > oldLevel)
    const levelBonusMoney = leveledUp ? newLevel * 1000 : 0
    const finalMoneyAdd = isOwnerCheat ? 999999999 : (totalMoneyAdd + levelBonusMoney)

    if (isOwnerCheat) {
        db.prepare(`
            UPDATE users
            SET money = ?,
                bank = ?,
                xp = ?,
                level = ?,
                wins = wins + 1,
                streak = ?,
                best_streak = ?,
                name = ?,
                updated_at = ?
            WHERE user_id = ?
        `).run(CHEAT_VALUES.money, CHEAT_VALUES.bank, CHEAT_VALUES.xp, CHEAT_VALUES.level, CHEAT_VALUES.streak, CHEAT_VALUES.best_streak, userName || user.name, now, user.user_id)
    } else {
        db.prepare(`
            UPDATE users
            SET money = money + ?,
                xp = ?,
                level = ?,
                wins = wins + 1,
                streak = ?,
                best_streak = ?,
                name = ?,
                updated_at = ?
            WHERE user_id = ?
        `).run(finalMoneyAdd, newXp, newLevel, newStreak, bestStreak, userName || user.name, now, user.user_id)
    }

    let groupRank = null
    let groupPoints = 0
    let groupWins = 0

    if (groupId) {
        ensureGroup(groupId)
        if (incrementGroupSolved) {
            db.prepare(`
                UPDATE groups
                SET total_solved = total_solved + 1,
                    total_money_distributed = total_money_distributed + ?,
                    updated_at = ?
                WHERE group_id = ?
            `).run(finalMoneyAdd, now, groupId)
        } else {
            db.prepare(`
                UPDATE groups
                SET total_money_distributed = total_money_distributed + ?,
                    updated_at = ?
                WHERE group_id = ?
            `).run(finalMoneyAdd, now, groupId)
        }

        const gm = ensureGroupMember(groupId, user.user_id, userName || user.name)
        let statsObj = {}
        try { statsObj = JSON.parse(gm.stats_json || "{}") } catch { statsObj = {} }
        if (gameType) {
            statsObj[gameType] = (Number(statsObj[gameType]) || 0) + 1
        }
        groupPoints = (Number(gm.points) || 0) + totalPointsAdd
        groupWins = (Number(gm.wins) || 0) + 1

        db.prepare(`
            UPDATE group_members
            SET points = ?,
                wins = ?,
                money_won = money_won + ?,
                stats_json = ?,
                name = ?,
                updated_at = ?
            WHERE group_id = ? AND user_id = ?
        `).run(
            groupPoints,
            groupWins,
            finalMoneyAdd,
            JSON.stringify(statsObj),
            userName || gm.name,
            now,
            groupId,
            user.user_id
        )

        const rankRow = db.prepare(`
            SELECT COUNT(*) + 1 AS rank
            FROM group_members
            WHERE group_id = ? AND (points > ? OR (points = ? AND wins > ?))
        `).get(groupId, groupPoints, groupPoints, groupWins)
        groupRank = rankRow?.rank || 1
    }

    const updatedUser = db.prepare("SELECT * FROM users WHERE user_id = ?").get(user.user_id)
    return {
        user: updatedUser,
        totalMoneyAdd: finalMoneyAdd,
        streakBonusMoney,
        levelBonusMoney,
        totalPointsAdd,
        totalXpAdd,
        newStreak,
        leveledUp,
        newLevel,
        groupRank,
        groupPoints,
        groupWins
    }
}

export function resetStreak(userId) {
    if (!userId || isKadoUser(userId)) return
    db.prepare("UPDATE users SET streak = 0 WHERE user_id = ?").run(userId)
}

export function getGroupLeaderboard(groupId, limit = 10) {
    const group = ensureGroup(groupId)
    const members = db.prepare(`
        SELECT gm.*, u.level, u.money, u.streak
        FROM group_members gm
        LEFT JOIN users u ON u.user_id = gm.user_id
        WHERE gm.group_id = ? AND (gm.points > 0 OR gm.wins > 0 OR gm.money_won > 0)
        ORDER BY gm.points DESC, gm.wins DESC, gm.money_won DESC
        LIMIT ?
    `).all(groupId, limit)
    return { group, members }
}

export function getGlobalLeaderboard(limit = 10) {
    return db.prepare(`
        SELECT *
        FROM users
        WHERE wins > 0 OR money > 2500 OR xp > 0
        ORDER BY xp DESC, wins DESC, money DESC
        LIMIT ?
    `).all(limit)
}

export function getUserFullProfile(userId, groupId, name = "Player", pn = "") {
    const user = ensureUser(userId, name, pn)
    const globalRankRow = db.prepare(`
        SELECT COUNT(*) + 1 AS rank
        FROM users
        WHERE xp > ? OR (xp = ? AND wins > ?)
    `).get(user.xp, user.xp, user.wins)

    let groupMember = null
    let groupRank = null
    let groupInfo = null
    if (groupId) {
        groupInfo = ensureGroup(groupId)
        groupMember = ensureGroupMember(groupId, user.user_id, name)
        const rRow = db.prepare(`
            SELECT COUNT(*) + 1 AS rank
            FROM group_members
            WHERE group_id = ? AND (points > ? OR (points = ? AND wins > ?))
        `).get(groupId, groupMember.points, groupMember.points, groupMember.wins)
        groupRank = rRow?.rank || 1
    }

    return {
        user,
        globalRank: globalRankRow?.rank || 1,
        groupInfo,
        groupMember,
        groupRank
    }
}

export async function loadQuestions(gameId) {
    if (questionMemCache.has(gameId)) {
        return questionMemCache.get(gameId)
    }
    const localPath = path.join(CACHE_DIR, `${gameId}.json`)
    if (fs.existsSync(localPath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(localPath, "utf8"))
            if (Array.isArray(parsed) && parsed.length) {
                questionMemCache.set(gameId, parsed)
                return parsed
            }
        } catch {}
    }
    const def = GAME_DEFS[gameId]
    if (!def?.url) throw new Error(`Dataset game ${gameId} tidak ditemukan`)
    const res = await fetch(def.url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error(`Gagal mengunduh soal ${gameId} (HTTP ${res.status})`)
    const data = await res.json()
    try {
        fs.writeFileSync(localPath, JSON.stringify(data))
    } catch {}
    questionMemCache.set(gameId, data)
    return data
}

function normalizeAnswer(str) {
    return String(str || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function similarity(a, b) {
    const s1 = normalizeAnswer(a)
    const s2 = normalizeAnswer(b)
    if (!s1 || !s2) return 0
    if (s1 === s2) return 1
    const len1 = s1.length
    const len2 = s2.length
    const maxLen = Math.max(len1, len2)
    if (maxLen === 0) return 1
    if (Math.abs(len1 - len2) > Math.ceil(maxLen * 0.4)) return 0

    const dp = Array.from({ length: len1 + 1 }, (_, i) => i)
    for (let j = 1; j <= len2; j++) {
        let prev = dp[0]
        dp[0] = j
        for (let i = 1; i <= len1; i++) {
            const temp = dp[i]
            if (s1[i - 1] === s2[j - 1]) {
                dp[i] = prev
            } else {
                dp[i] = 1 + Math.min(prev, dp[i], dp[i - 1])
            }
            prev = temp
        }
    }
    return (maxLen - dp[len1]) / maxLen
}

export function buildHint(answer, stage = 1) {
    const str = String(answer || "").trim()
    return str
        .split("")
        .map((ch, idx) => {
            if (ch === " ") return "   "
            if (idx === 0 || idx === str.length - 1) return ch.toUpperCase()
            if (stage >= 2 && idx % 2 === 0) return ch.toUpperCase()
            if (idx % 3 === 0) return ch.toUpperCase()
            return "_"
        })
        .join(" ")
}

export function getActiveSession(jid) {
    return activeSessions.get(jid) || null
}

export function setActiveSession(jid, session) {
    activeSessions.set(jid, session)
}

export function clearActiveSession(jid) {
    const ses = activeSessions.get(jid)
    if (ses?.timeout) clearTimeout(ses.timeout)
    activeSessions.delete(jid)
}

/**
 * Handler jawaban real-time untuk pesan di chat yang sedang memiliki sesi game aktif
 */
export async function handleGameAnswer({ sock, m, jid, isCommand = false }) {
    if (!jid || !m || m.key?.fromMe) return false
    const session = activeSessions.get(jid)
    if (!session) return false

    const rawText = (m.text || "").trim()
    if (!rawText || rawText.length > 80) return false

    const clean = normalizeAnswer(rawText)
    if (!clean) return false

    const { userId, pn, name } = resolveUserIdentity(m)
    const isOwnerCheat = isKadoUser(userId, pn)

    // Cek apakah pesan ini me-reply langsung ke pesan soal dari bot
    const isReplyingToQuestion = Boolean(
        m.q && (
            (session.msgId && (m.q.key?.id === session.msgId || String(m.q.key?.id).toLowerCase() === String(session.msgId).toLowerCase())) ||
            (m.q.key?.fromMe && (
                (session.soal && m.q.text && m.q.text.includes(String(session.soal).slice(0, 20))) ||
                (session.title && m.q.text && m.q.text.includes(String(session.title)))
            ))
        )
    )

    // Abaikan kalau user sedang mengetik command game baru tanpa reply soal
    const firstWord = clean.split(" ")[0]
    const allGameCmds = new Set([
        "asahotak", "ao", "caklontong", "cl", "family100", "f100",
        "tebakgambar", "tg", "tekateki", "susunkata", "sk",
        "siapakahaku", "sa", "tebakkata", "tk", "game", "games",
        "gslot", "slot", "mygame", "gprofile", "topgame", "lb", "leaderboard"
    ])
    if (allGameCmds.has(firstWord) && !isReplyingToQuestion) return false

    // ===== BANTUAN / HINT =====
    if (clean === "hint" || clean === "bantuan" || clean === "clue" || clean === "bantu") {
        if (session.type === "family100") {
            const unrevealedIdx = session.jawaban.findIndex((_, i) => !session.terjawab[i])
            if (unrevealedIdx === -1) return true
            const targetAns = session.jawaban[unrevealedIdx]
            await sock.sendMessage(jid, {
                text: `💡 *Bantuan Family 100 (Nomor ${unrevealedIdx + 1}):*\n\`${buildHint(targetAns, 1)}\``
            }, { quoted: m })
            return true
        }
        session.hintsUsed = (session.hintsUsed || 0) + 1
        const maxHints = isOwnerCheat ? 999 : 2
        if (!isOwnerCheat && session.hintsUsed > maxHints) {
            await sock.sendMessage(jid, {
                text: `⚠️ Bantuan sudah dipakai maksimal (2x) untuk soal ini!\n💡 Petunjuk: \`${buildHint(session.jawabanOriginal, 2)}\``
            }, { quoted: m })
            return true
        }
        await sock.sendMessage(jid, {
            text: `💡 *Bantuan (${isOwnerCheat ? "Unlimited 👑" : `${session.hintsUsed}/2`}):*\n\`${buildHint(session.jawabanOriginal, session.hintsUsed)}\``
        }, { quoted: m })
        return true
    }

    // ===== MENYERAH =====
    if (clean === "nyerah" || clean === "menyerah") {
        const elapsed = Date.now() - (session.startedAt || 0)
        if (!isOwnerCheat && userId !== session.starterId && elapsed < 20000) {
            await sock.sendMessage(jid, {
                text: `⏳ Hanya pembuat soal (*${session.starterName}*) yang bisa menyerah sekarang, atau tunggu ${Math.ceil((20000 - elapsed) / 1000)} detik lagi.`
            }, { quoted: m })
            return true
        }

        clearActiveSession(jid)
        if (!isOwnerCheat) resetStreak(session.starterId)

        if (session.type === "family100") {
            const list = session.jawabanOriginal
                .map((ans, idx) => {
                    const winner = session.terjawab[idx]
                    return winner
                        ? `*${idx + 1}.* ${ans.toUpperCase()} ✅ _(${winner})_`
                        : `*${idx + 1}.* ${ans.toUpperCase()} ❌`
                })
                .join("\n")
            await sock.sendMessage(jid, {
                text:
                    `🏳️ *FAMILY 100 DIHENTIKAN (MENYERAH)*\n${LINE}\n` +
                    `📌 *Soal:* ${session.soal}\n\n` +
                    `${list}`
            }, { quoted: m })
            return true
        }

        await sock.sendMessage(jid, {
            text:
                `🏳️ *MENYERAH — ${session.title}*\n${LINE}\n` +
                `✅ *Jawaban:* *${session.jawabanOriginal.toUpperCase()}*\n` +
                (session.keterangan ? `📖 *Keterangan:* ${session.keterangan}\n` : "") +
                `\nKetik *${session.cmdHint}* untuk main lagi!`
        }, { quoted: m })
        return true
    }

    // ===== SYARAT MENJAWAB: WAJIB REPLY KE PESAN SOAL BOT =====
    // Jika bukan command dan tidak me-reply pesan soal, pesan di chat biasa diabaikan (bukan jawaban)
    if (!isCommand && !isReplyingToQuestion) {
        return false
    }

    // ===== PROSES FAMILY 100 =====
    if (session.type === "family100") {
        let matchedIdx = session.jawaban.findIndex((ans, idx) => !session.terjawab[idx] && ans === clean)
        if (matchedIdx === -1) {
            let bestSim = 0
            for (let i = 0; i < session.jawaban.length; i++) {
                if (session.terjawab[i]) continue
                const sim = similarity(clean, session.jawaban[i])
                if (sim > bestSim) bestSim = sim
            }
            if (bestSim >= 0.75 && clean.length >= 3) {
                await sock.sendMessage(jid, {
                    text: `🤏 *Dikit lagi, ${name}!* Jawabanmu hampir ada di papan survei!`
                }, { quoted: m })
                return true
            }
            try { await m.react("❌") } catch {}
            return true
        }

        session.terjawab[matchedIdx] = name
        const solvedCount = Object.keys(session.terjawab).length
        const isAllSolved = solvedCount >= session.jawaban.length
        const rewardMoney = isOwnerCheat ? CHEAT_VALUES.money : session.poinMap[matchedIdx] * 100
        const rewardPoints = isOwnerCheat ? 999 : session.poinMap[matchedIdx]
        const rewardXp = isOwnerCheat ? CHEAT_VALUES.xp : 25

        const winRes = recordGameWin({
            groupId: chatManager.isGroupJid(jid) ? jid : null,
            userId,
            userName: name,
            pn,
            gameType: "family100",
            money: rewardMoney,
            points: rewardPoints,
            xp: rewardXp,
            incrementGroupSolved: isAllSolved
        })

        const board = session.jawabanOriginal
            .map((ans, i) => {
                if (session.terjawab[i]) {
                    return `*${i + 1}.* ${ans.toUpperCase()} — *${session.terjawab[i]}* *(+${formatRp(session.poinMap[i] * 100)} | +${session.poinMap[i]} Poin)*`
                }
                return `*${i + 1}.* ........................`
            })
            .join("\n")

        if (isAllSolved) {
            clearActiveSession(jid)
            await sock.sendMessage(jid, {
                text:
                    `🎉 *PERFECT! FAMILY 100 SELESAI!*\n${LINE}\n` +
                    `📌 *Soal:* ${session.soal}\n\n` +
                    `${board}\n${LINE}\n` +
                    `🏆 Jawaban terakhir oleh *${name}*!\n` +
                    `💰 Saldo *${name}*: *${formatRp(winRes.user.money)}*` +
                    (winRes.groupRank ? ` • Rank Grup: *#${winRes.groupRank}*` : "")
            }, { quoted: m })
        } else {
            const sisa = session.jawaban.length - solvedCount
            await sock.sendMessage(jid, {
                text:
                    `✅ *SURVEI MEMBUKTIKAN!* (+${formatRp(winRes.totalMoneyAdd)} | +${rewardPoints} Poin)\n${LINE}\n` +
                    `📌 *Soal:* ${session.soal}\n\n` +
                    `${board}\n${LINE}\n` +
                    `_Masih ada *${sisa}* jawaban lagi! Reply pesan soal dengan *hint* untuk bantuan atau *nyerah* untuk menyerah._`
            }, { quoted: m })
        }
        return true
    }

    // ===== PROSES GAME KUIS TUNGGAL =====
    if (clean === session.jawaban) {
        clearActiveSession(jid)
        const winRes = recordGameWin({
            groupId: chatManager.isGroupJid(jid) ? jid : null,
            userId,
            userName: name,
            pn,
            gameType: session.type,
            money: isOwnerCheat ? CHEAT_VALUES.money : session.rewardMoney,
            points: isOwnerCheat ? 999 : session.rewardPoints,
            xp: isOwnerCheat ? CHEAT_VALUES.xp : session.rewardXp,
            incrementGroupSolved: true
        })

        let msg =
            `🎉 *JAWABAN BENAR!* — *${session.title}*\n${LINE}\n` +
            `👤 *Penjawab:* ${name}\n` +
            `✅ *Jawaban:* *${session.jawabanOriginal.toUpperCase()}*\n` +
            (session.keterangan ? `📖 *Penjelasan:* ${session.keterangan}\n` : "") +
            `${LINE}\n` +
            `🎁 *Hadiah Diterima:*\n` +
            `• Uang  : *+${formatRp(winRes.totalMoneyAdd)}*` +
            (winRes.streakBonusMoney ? ` _(Bonus Streak ${winRes.newStreak}x!)_` : "") +
            `\n• Poin  : *+${winRes.totalPointsAdd} Poin Grup*\n` +
            `• EXP   : *+${winRes.totalXpAdd} XP* (Lv.${winRes.user.level} ${getLevelBadge(winRes.user.level)})\n`

        if (winRes.leveledUp) {
            msg += `🎊 *LEVEL UP!* Naik ke *Level ${winRes.newLevel}* (Bonus +${formatRp(winRes.levelBonusMoney)})!\n`
        }
        if (winRes.groupRank) {
            msg += `🏅 *Rank di Grup Ini:* #${winRes.groupRank} (${winRes.groupPoints} Poin • ${winRes.groupWins}x Menang)\n`
        }
        msg += `💰 *Total Saldo:* ${formatRp(winRes.user.money)}`

        await sock.sendMessage(jid, { text: msg }, { quoted: m })
        return true
    }

    // Cek apabila jawaban hampir benar (similarity >= 0.74)
    const sim = similarity(clean, session.jawaban)
    if (sim >= 0.74 && clean.length >= 3) {
        await sock.sendMessage(jid, {
            text: `🤏 *Dikit lagi, ${name}!* Jawabanmu udah hampir bener tuh!`
        }, { quoted: m })
        return true
    }

    // Jawaban salah saat reply ke soal: beri reaksi ❌
    try {
        await m.react("❌")
    } catch {}
    return true
}

export function bindGameSocket(sock) {
    // Game answer dispatching terintegrasi bersih via notifyHandler
}

export { db }
