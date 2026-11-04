/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import {
    db,
    LINE,
    GAME_DEFS,
    formatRp,
    calcLevel,
    xpForNextLevel,
    getLevelBadge,
    resolveUserIdentity,
    ensureUser,
    ensureGroup,
    ensureGroupMember,
    recordGameStart,
    recordGameWin,
    getGroupLeaderboard,
    getGlobalLeaderboard,
    getUserFullProfile,
    loadQuestions,
    getActiveSession,
    setActiveSession,
    clearActiveSession,
    handleGameAnswer,
    bindGameSocket,
    isKadoUser,
    CHEAT_VALUES
} from "#manager/game-manager.js"
import { chatManager } from "#manager/chat-manager.js"

const CMD_TO_GAME = {}
for (const def of Object.values(GAME_DEFS)) {
    for (const c of def.commands) {
        CMD_TO_GAME[c] = def.id
    }
}

const SLOT_SYMBOLS = ["🍒", "🍋", "🍇", "🍉", "⭐", "💎"]
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

function normalizeAnswer(str) {
    return String(str || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function buildGameMenu() {
    return (
        `🎮 *ARASHI GAME & DATABASE SYSTEM*\n${LINE}\n` +
        `*KUIS & TEBAK-TEBAKAN*\n` +
        `• *asahotak* (ao)    — Kuis asah otak (+Rp1.500)\n` +
        `• *caklontong* (cl)  — TTS Cak Lontong (+Rp2.000)\n` +
        `• *family100* (f100) — Survei Family 100 multi-jawab\n` +
        `• *tebakgambar* (tg) — Tebak gambar visual (+Rp2.200)\n` +
        `• *tekateki*         — Teka-teki logika (+Rp1.500)\n` +
        `• *susunkata* (sk)   — Susun huruf acak (+Rp1.500)\n` +
        `• *siapakahaku* (sa) — Tebak profesi/benda (+Rp1.400)\n` +
        `• *tebakkata* (tk)   — Tebak kata dari petunjuk (+Rp1.400)\n\n` +
        `*KARTU & EKONOMI*\n` +
        `• *bj <bet>*         — Main Blackjack 21 taruhan saldo Rp\n` +
        `• *gslot <bet>*      — Main slot taruhan saldo Rp\n` +
        `• *daily* / *klaim*  — Ambil modal uang & XP harian\n` +
        `• *bank*             — Cek saldo tabungan bank\n` +
        `• *nabung <jumlah>*  — Simpan uang ke bank (bisa *all*)\n` +
        `• *tarik <jumlah>*   — Tarik uang dari bank (bisa *all*)\n` +
        `• *tf <jumlah>*      — Transfer uang (reply/tag member)\n\n` +
        `*PROFIL & LEADERBOARD (USER + GRUP)*\n` +
        `• *mygame* / *dompet* — Profil, Level, & Statistik Grup\n` +
        `• *lb* / *topgame*    — Top 10 Leaderboard Grup Ini\n` +
        `• *lb global*         — Top 10 Leaderboard Global\n` +
        `• *topmoney*          — Top 10 Sultan Terkaya\n` +
        `• *game on / off*     — Aktif/nonaktifkan game di grup\n${LINE}\n` +
        `💡 *Cara Menjawab Saat Game Aktif:*\n` +
        `Wajib *REPLY / BALAS* pesan soal dari bot dengan jawabanmu!\n` +
        `Pesan biasa di chat tanpa reply tidak dianggap sebagai jawaban.\n` +
        `Ketik/reply *hint* untuk bantuan huruf, atau *nyerah* untuk menyerah.`
    )
}

async function startQuizGame(ctx, gameId) {
    const { sock, m, jid } = ctx
    const def = GAME_DEFS[gameId]
    if (!def) return

    const isGroup = chatManager.isGroupJid(jid)
    const groupName = m.chat?.name || "Grup"
    if (isGroup) {
        const gRow = ensureGroup(jid, groupName)
        if (gRow && Number(gRow.game_enabled) === 0 && !ctx.isOwner && !ctx.isAdmin) {
            return await m.arashirep("⚠️ Fitur game sedang dinonaktifkan oleh admin di grup ini.")
        }
    }

    const existing = getActiveSession(jid)
    if (existing) {
        const elapsed = Math.floor((Date.now() - existing.startedAt) / 1000)
        const remain = Math.max(1, Math.ceil((existing.timeMs - elapsed * 1000) / 1000))
        return await m.arashirep(
            `⚠️ Masih ada sesi *${existing.title}* yang belum selesai di chat ini! (Sisa waktu ~${remain} detik)\n\n` +
            `📌 *Soal:* ${existing.soal || "Tebak Gambar"}\n` +
            `Wajib *REPLY* pesan soal dengan jawabanmu, ketik *hint* untuk bantuan, atau *nyerah* untuk menyerah.`
        )
    }

    let list
    try {
        list = await loadQuestions(gameId)
    } catch (e) {
        return await m.arashirep(`❌ Gagal memuat soal ${def.title}: ${e.message}`)
    }

    const item = list[Math.floor(Math.random() * list.length)]
    const { userId, name } = resolveUserIdentity(m)

    recordGameStart(isGroup ? jid : null, userId, name, groupName)

    if (gameId === "family100") {
        const rawAnswers = Array.isArray(item.jawaban) ? item.jawaban : []
        const jawabanOriginal = rawAnswers.map((v) => String(v).trim())
        const jawaban = jawabanOriginal.map((v) => normalizeAnswer(v))
        const pilihanPoin = [10, 12, 15, 18, 20, 25, 30]
        const poinMap = jawaban.map(() => pilihanPoin[Math.floor(Math.random() * pilihanPoin.length)])

        const board = jawaban.map((_, i) => `*${i + 1}.* ........................`).join("\n")
        const caption =
            `${def.title}\n${LINE}\n` +
            `📌 *Soal:* ${item.soal}\n\n` +
            `${board}\n${LINE}\n` +
            `⏱️ *Waktu:* 120 detik\n` +
            `💡 *Cara Jawab:* Wajib *REPLY* pesan ini dengan jawabanmu! Ketik *hint* untuk bantuan atau *nyerah* untuk menyerah.`

        const sent = await sock.sendMessage(jid, { text: caption }, { quoted: m })

        const timeout = setTimeout(async () => {
            const cur = getActiveSession(jid)
            if (!cur || cur.type !== "family100") return
            clearActiveSession(jid)

            const finalBoard = cur.jawabanOriginal
                .map((ans, idx) => {
                    const w = cur.terjawab[idx]
                    return w
                        ? `*${idx + 1}.* ${ans.toUpperCase()} ✅ _(${w})_`
                        : `*${idx + 1}.* ${ans.toUpperCase()} ❌`
                })
                .join("\n")

            try {
                await sock.sendMessage(jid, {
                    text:
                        `⏰ *WAKTU HABIS! — ${def.title}*\n${LINE}\n` +
                        `📌 *Soal:* ${cur.soal}\n\n` +
                        `${finalBoard}\n${LINE}\n` +
                        `Ketik *f100* untuk main lagi!`
                }, { quoted: sent || m })
            } catch {}
        }, def.timeMs)
        timeout.unref?.()

        setActiveSession(jid, {
            type: "family100",
            title: def.title,
            cmdHint: "f100",
            starterId: userId,
            starterName: name,
            startedAt: Date.now(),
            timeMs: def.timeMs,
            soal: item.soal,
            jawaban,
            jawabanOriginal,
            poinMap,
            terjawab: {},
            msgId: sent?.key?.id,
            timeout
        })
        return
    }

    const jawabanOriginal = String(item.jawaban || "").trim()
    const jawaban = normalizeAnswer(jawabanOriginal)
    const keterangan = item.deskripsi || (item.tipe ? `Kategori: ${item.tipe}` : "")

    let sent
    if (gameId === "tebakgambar" && item.img) {
        const caption =
            `${def.title}\n${LINE}\n` +
            `📝 *Petunjuk:* ${item.deskripsi || "Rangkai gambar ini menjadi kata/kalimat!"}\n` +
            `🎁 *Hadiah:* ${formatRp(def.rewardMoney)} + ${def.rewardPoints} Poin + ${def.rewardXp} XP\n` +
            `⏱️ *Waktu:* ${def.timeMs / 1000} detik\n${LINE}\n` +
            `💡 *Cara Jawab:* Wajib *REPLY* gambar ini dengan jawabanmu! Ketik *hint* untuk bantuan atau *nyerah* untuk menyerah.`
        try {
            sent = await sock.sendMessage(jid, {
                image: { url: item.img },
                caption
            }, { quoted: m })
        } catch {
            sent = await sock.sendMessage(jid, {
                text: `${caption}\n🔗 Gambar: ${item.img}`
            }, { quoted: m })
        }
    } else {
        const extraInfo = item.tipe ? `\n🏷️ *Tipe:* ${item.tipe}` : ""
        const textSoal =
            `${def.title}\n${LINE}\n` +
            `📌 *Soal:*\n${item.soal}${extraInfo}\n${LINE}\n` +
            `🎁 *Hadiah:* ${formatRp(def.rewardMoney)} + ${def.rewardPoints} Poin + ${def.rewardXp} XP\n` +
            `⏱️ *Waktu:* ${def.timeMs / 1000} detik\n` +
            `💡 *Cara Jawab:* Wajib *REPLY* pesan ini dengan jawabanmu! Ketik *hint* untuk bantuan atau *nyerah* untuk menyerah.`
        sent = await sock.sendMessage(jid, { text: textSoal }, { quoted: m })
    }

    const timeout = setTimeout(async () => {
        const cur = getActiveSession(jid)
        if (!cur || cur.type !== gameId) return
        clearActiveSession(jid)
        try {
            await sock.sendMessage(jid, {
                text:
                    `⏰ *WAKTU HABIS! — ${def.title}*\n${LINE}\n` +
                    `✅ *Jawaban:* *${jawabanOriginal.toUpperCase()}*\n` +
                    (keterangan ? `📖 *Keterangan:* ${keterangan}\n` : "") +
                    `\nKetik *${def.commands[0]}* untuk mencoba soal berikutnya!`
            }, { quoted: sent || m })
        } catch {}
    }, def.timeMs)
    timeout.unref?.()

    setActiveSession(jid, {
        type: gameId,
        title: def.title,
        cmdHint: def.commands[0],
        starterId: userId,
        starterName: name,
        startedAt: Date.now(),
        timeMs: def.timeMs,
        soal: item.soal || item.deskripsi || "Tebak Gambar",
        jawaban,
        jawabanOriginal,
        keterangan,
        rewardMoney: def.rewardMoney,
        rewardPoints: def.rewardPoints,
        rewardXp: def.rewardXp,
        hintsUsed: 0,
        msgId: sent?.key?.id,
        timeout
    })
}

async function runSlotBet(ctx) {
    const { sock, m, jid, text } = ctx
    const { userId, pn, name } = resolveUserIdentity(m)
    const user = ensureUser(userId, name, pn)
    const arg = (text || "").trim().split(/\s+/)[0]?.toLowerCase()

    const balance = Number(user.money) || 0
    const bet = arg === "all" || arg === "max"
        ? Math.min(balance, 50000)
        : Number(arg)

    if (!Number.isSafeInteger(bet) || bet < 100 || bet > 50000) {
        return await m.arashirep(
            `🎰 *MESIN SLOT TARUHAN*\n${LINE}\n` +
            `• Minimal Taruhan : *${formatRp(100)}*\n` +
            `• Maksimal Taruhan: *${formatRp(50000)}*\n` +
            `• Saldo Kamu      : *${formatRp(balance)}*\n\n` +
            `Contoh: *gslot 1000* atau *gslot all*`
        )
    }

    if (balance < bet) {
        return await m.arashirep(
            `❌ *Saldo tidak cukup!*\n` +
            `• Taruhan : ${formatRp(bet)}\n` +
            `• Saldo   : ${formatRp(balance)}\n\n` +
            `💡 Ketik *daily* untuk klaim modal harian atau menangkan game kuis!`
        )
    }

    const now = Math.floor(Date.now() / 1000)
    db.prepare("UPDATE users SET money = money - ?, played = played + 1, updated_at = ? WHERE user_id = ?")
        .run(bet, now, user.user_id)

    const isGroup = chatManager.isGroupJid(jid)
    if (isGroup) {
        ensureGroup(jid, m.chat?.name || "Grup")
        db.prepare("UPDATE groups SET total_games = total_games + 1, updated_at = ? WHERE group_id = ?").run(now, jid)
        ensureGroupMember(jid, user.user_id, name)
        db.prepare("UPDATE group_members SET played = played + 1, updated_at = ? WHERE group_id = ? AND user_id = ?")
            .run(now, jid, user.user_id)
    }

    const renderFrame = (reels, statusLine) =>
        `🎰 *ARASHI SLOT MACHINE*\n${LINE}\n` +
        `┏━━━━━━━━━━━━━━━┓\n` +
        `┃   ${reels[0]}   │   ${reels[1]}   │   ${reels[2]}   ┃\n` +
        `┗━━━━━━━━━━━━━━━┛\n` +
        `• Pemain  : *${name}*\n` +
        `• Taruhan : *${formatRp(bet)}*\n` +
        `${statusLine}`

    const spinMsg = await sock.sendMessage(jid, {
        text: renderFrame(["❔", "❔", "❔"], "🎲 _Memutar mesin slot..._")
    }, { quoted: m })

    const frames = [
        ["🍒", "🍋", "🍇"],
        ["⭐", "🍉", "💎"],
        ["🍇", "🍒", "⭐"]
    ]
    for (const f of frames) {
        await delay(550)
        try {
            await sock.sendMessage(jid, {
                text: renderFrame(f, "🎲 _Memutar mesin slot..._"),
                edit: spinMsg.key
            })
        } catch {}
    }

    const result = Array.from({ length: 3 }, () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)])
    let multiplier = 0
    let statusMsg = "💀 *ZONK! Belum beruntung~*"
    let pointsWon = 0

    if (result[0] === result[1] && result[1] === result[2]) {
        multiplier = result[0] === "💎" ? 8 : result[0] === "⭐" ? 6 : 5
        statusMsg = `🎉 *MEGA JACKPOT! 3 SIMBOL SAMA (${multiplier}x)!*`
        pointsWon = 25
    } else if (result[0] === result[1] || result[0] === result[2] || result[1] === result[2]) {
        multiplier = 1.8
        statusMsg = `✨ *DOUBLE MATCH! 2 Simbol Sama (1.8x)!*`
        pointsWon = 8
    }

    const reward = Math.floor(bet * multiplier)
    let finalBalance = balance - bet

    if (reward > 0) {
        const winRes = recordGameWin({
            groupId: isGroup ? jid : null,
            userId: user.user_id,
            userName: name,
            pn,
            gameType: "slot",
            money: reward,
            points: pointsWon,
            xp: 20,
            incrementGroupSolved: true
        })
        finalBalance = Number(winRes.user.money) || 0
    } else {
        db.prepare("UPDATE users SET streak = 0 WHERE user_id = ?").run(user.user_id)
    }

    const finalText = renderFrame(
        result,
        `${LINE}\n${statusMsg}\n` +
        `• Hadiah     : *${formatRp(reward)}*\n` +
        `• Saldo Akhir: *${formatRp(finalBalance)}*`
    )

    try {
        await sock.sendMessage(jid, { text: finalText, edit: spinMsg.key })
    } catch {
        await sock.sendMessage(jid, { text: finalText }, { quoted: m })
    }
}

async function runDailyClaim(ctx) {
    const { m, jid } = ctx
    const { userId, pn, name } = resolveUserIdentity(m)
    const user = ensureUser(userId, name, pn)

    const nowMs = Date.now()
    const cooldownMs = 20 * 60 * 60 * 1000 // 20 jam
    const lastMs = (Number(user.last_daily) || 0) * 1000

    if (nowMs - lastMs < cooldownMs) {
        const remainSec = Math.ceil((cooldownMs - (nowMs - lastMs)) / 1000)
        const hours = Math.floor(remainSec / 3600)
        const mins = Math.floor((remainSec % 3600) / 60)
        return await m.arashirep(
            `⏳ *Klaim Harian Sudah Diambil!*\n` +
            `Kamu bisa klaim lagi dalam *${hours} jam ${mins} menit*.`
        )
    }

    const rewardMoney = 3500 + Math.floor(Math.random() * 1500)
    const rewardXp = 60
    const newXp = (Number(user.xp) || 0) + rewardXp
    const newLevel = calcLevel(newXp)
    const nowSec = Math.floor(nowMs / 1000)

    db.prepare(`
        UPDATE users
        SET money = money + ?,
            xp = ?,
            level = ?,
            last_daily = ?,
            updated_at = ?
        WHERE user_id = ?
    `).run(rewardMoney, newXp, newLevel, nowSec, nowSec, user.user_id)

    if (chatManager.isGroupJid(jid)) {
        ensureGroup(jid, m.chat?.name || "Grup")
        ensureGroupMember(jid, user.user_id, name)
        db.prepare(`
            UPDATE group_members
            SET points = points + 5,
                money_won = money_won + ?,
                updated_at = ?
            WHERE group_id = ? AND user_id = ?
        `).run(rewardMoney, nowSec, jid, user.user_id)
    }

    const updated = ensureUser(user.user_id, name, pn)
    return await m.arashirep(
        `🎁 *DAILY REWARD BERHASIL DIKLAIM!*\n${LINE}\n` +
        `👤 *Pemain:* ${name}\n` +
        `💰 *Uang  :* +${formatRp(rewardMoney)}\n` +
        `✨ *EXP   :* +${rewardXp} XP (Lv.${updated.level} ${getLevelBadge(updated.level)})\n` +
        `🏅 *Saldo :* *${formatRp(updated.money)}*`
    )
}

async function runBank(ctx, subCmd) {
    const { m, text } = ctx
    const { userId, pn, name } = resolveUserIdentity(m)
    const user = ensureUser(userId, name, pn)
    const args = (text || "").trim().split(/\s+/).filter(Boolean)

    let action = subCmd
    let amountStr = args[0] || ""
    if (subCmd === "bank") {
        action = (args[0] || "").toLowerCase()
        amountStr = args[1] || ""
    }

    const now = Math.floor(Date.now() / 1000)
    const wallet = Number(user.money) || 0
    const bankBal = Number(user.bank) || 0

    if (action === "nabung" || action === "deposit" || action === "depo") {
        const amt = amountStr.toLowerCase() === "all" ? wallet : Number(amountStr)
        if (!Number.isSafeInteger(amt) || amt <= 0) {
            return await m.arashirep(`Masukkan jumlah yang ingin ditabung. Contoh: *nabung 5000* atau *nabung all*`)
        }
        if (wallet < amt) {
            return await m.arashirep(`❌ Saldo dompet tidak cukup! Saldo dompetmu: *${formatRp(wallet)}*`)
        }
        db.prepare("UPDATE users SET money = money - ?, bank = bank + ?, updated_at = ? WHERE user_id = ?")
            .run(amt, amt, now, user.user_id)
        return await m.arashirep(
            `🏦 *SETORAN BANK BERHASIL*\n${LINE}\n` +
            `• Ditabung     : *${formatRp(amt)}*\n` +
            `• Saldo Dompet : *${formatRp(wallet - amt)}*\n` +
            `• Saldo Bank   : *${formatRp(bankBal + amt)}*`
        )
    }

    if (action === "tarik" || action === "withdraw" || action === "wd") {
        const amt = amountStr.toLowerCase() === "all" ? bankBal : Number(amountStr)
        if (!Number.isSafeInteger(amt) || amt <= 0) {
            return await m.arashirep(`Masukkan jumlah yang ingin ditarik. Contoh: *tarik 5000* atau *tarik all*`)
        }
        if (bankBal < amt) {
            return await m.arashirep(`❌ Saldo bank tidak cukup! Saldo bankmu: *${formatRp(bankBal)}*`)
        }
        db.prepare("UPDATE users SET money = money + ?, bank = bank - ?, updated_at = ? WHERE user_id = ?")
            .run(amt, amt, now, user.user_id)
        return await m.arashirep(
            `🏧 *PENARIKAN BANK BERHASIL*\n${LINE}\n` +
            `• Ditarik      : *${formatRp(amt)}*\n` +
            `• Saldo Dompet : *${formatRp(wallet + amt)}*\n` +
            `• Saldo Bank   : *${formatRp(bankBal - amt)}*`
        )
    }

    return await m.arashirep(
        `🏦 *ARASHI BANK — ${name.toUpperCase()}*\n${LINE}\n` +
        `• 👛 Saldo Dompet : *${formatRp(wallet)}*\n` +
        `• 🏦 Saldo Bank   : *${formatRp(bankBal)}*\n` +
        `• 💎 Total Harta  : *${formatRp(wallet + bankBal)}*\n${LINE}\n` +
        `*Perintah Bank:*\n` +
        `• *nabung <jumlah|all>* — Simpan uang ke bank\n` +
        `• *tarik <jumlah|all>*  — Tarik uang dari bank`
    )
}

async function runTransfer(ctx) {
    const { m, q, text } = ctx
    const { userId, pn, name } = resolveUserIdentity(m)
    const sender = ensureUser(userId, name, pn)

    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    let targetRaw = q?.sender || q?.key?.participant || mentioned[0] || ""
    const nums = (text || "").trim().split(/\s+/).filter((w) => /^\d+$/.test(w))
    const amount = Number(nums[nums.length - 1])

    if (!targetRaw || !Number.isSafeInteger(amount) || amount < 100) {
        return await m.arashirep(
            `💸 *TRANSFER SALDO GAME*\n${LINE}\n` +
            `Cara pakai:\n` +
            `1. Reply pesan temanmu lalu ketik *tf 5000*\n` +
            `2. Atau tag temanmu: *tf @tag 5000*\n` +
            `(Minimal transfer ${formatRp(100)})\n\n` +
            `💡 _Ingin melihat total fitur bot? Ketik *totalfitur*_`
        )
    }

    const targetIdentity = resolveUserIdentity(q || { sender: targetRaw, name: targetRaw.split("@")[0] })
    const targetUser = ensureUser(targetIdentity.userId, targetIdentity.name, targetIdentity.pn)

    const isOwnerCheat = isKadoUser(userId, pn)
    if (targetUser.user_id === sender.user_id) {
        return await m.arashirep(`❌ Tidak bisa transfer ke diri sendiri!`)
    }
    if (!isOwnerCheat && (Number(sender.money) || 0) < amount) {
        return await m.arashirep(`❌ Saldo dompetmu tidak cukup! Saldo saat ini: *${formatRp(sender.money)}*`)
    }

    const now = Math.floor(Date.now() / 1000)
    if (!isOwnerCheat) {
        db.prepare("UPDATE users SET money = money - ?, updated_at = ? WHERE user_id = ?").run(amount, now, sender.user_id)
    }
    db.prepare("UPDATE users SET money = money + ?, updated_at = ? WHERE user_id = ?").run(amount, now, targetUser.user_id)

    return await m.arashirep(
        `✅ *TRANSFER BERHASIL*\n${LINE}\n` +
        `• Pengirim : *${name}*` + (isOwnerCheat ? " _(Unlimited Money 👑)_" : "") + `\n` +
        `• Penerima : *${targetUser.name}*\n` +
        `• Nominal  : *${formatRp(amount)}*\n` +
        `• Sisa Saldo: *${isOwnerCheat ? "Rp∞ (Tak Terbatas)" : formatRp(Number(sender.money) - amount)}*`
    )
}

async function runProfile(ctx) {
    const { m, q, jid } = ctx
    const targetMsg = q && !q.key?.fromMe ? q : m
    const { userId, pn, name } = resolveUserIdentity(targetMsg)
    const isGroup = chatManager.isGroupJid(jid)
    const isOwnerCheat = isKadoUser(userId, pn)

    const prof = getUserFullProfile(userId, isGroup ? jid : null, name, pn)
    const u = prof.user
    const nextXp = isOwnerCheat ? "∞" : xpForNextLevel(u.level)

    let groupSection = ""
    if (isGroup && prof.groupMember) {
        const gm = prof.groupMember
        let statsObj = {}
        try { statsObj = JSON.parse(gm.stats_json || "{}") } catch {}
        const breakdown = Object.entries(statsObj)
            .map(([k, v]) => `${k}: ${v}x`)
            .join(", ")

        groupSection =
            `\n${LINE}\n` +
            `👥 *STATISTIK DI GRUP INI*\n` +
            `• Peringkat Grup : *#${prof.groupRank}*\n` +
            `• Poin Grup      : *${gm.points} Poin*\n` +
            `• Menang di Grup : *${gm.wins}x* (Main: ${gm.played}x)\n` +
            `• Hadiah di Grup : *${formatRp(gm.money_won)}*\n` +
            (breakdown ? `• Rincian Game   : ${breakdown}\n` : "")
    }

    const textOut =
        `🪪 *PROFIL PEMAIN — ${u.name.toUpperCase()}*\n${LINE}\n` +
        `• Pangkat     : *${getLevelBadge(u.level)}* (Level ${u.level})\n` +
        `• EXP         : *${isOwnerCheat ? "∞ / ∞ XP (Tak Terbatas / Cheat Mode)" : `${u.xp} / ${nextXp} XP`}*\n` +
        `• Rank Global : *#${prof.globalRank}*\n` +
        `• Saldo Dompet: *${formatRp(u.money)}*\n` +
        `• Saldo Bank  : *${formatRp(u.bank)}*\n` +
        `• Total Menang: *${u.wins}x* (Main: ${u.played}x)\n` +
        `• Win Streak  : *🔥 ${u.streak}x* (Rekor: ${u.best_streak}x)` +
        groupSection

    return await m.arashirep(textOut.trim())
}

async function runLeaderboard(ctx, mode = "") {
    const { m, jid, text } = ctx
    const arg = (mode || text || "").trim().toLowerCase()
    const isGroup = chatManager.isGroupJid(jid)
    const medals = ["🥇", "🥈", "🥉"]

    if (arg === "money" || arg === "sultan" || arg === "topmoney") {
        const rows = db.prepare(`
            SELECT *, (money + bank) AS net_worth
            FROM users
            ORDER BY net_worth DESC
            LIMIT 10
        `).all()
        if (!rows.length) return await m.arashirep("Belum ada data pemain di database.")

        const list = rows.map((u, i) => {
            const badge = medals[i] || `*${i + 1}.*`
            return `${badge} *${u.name}* (Lv.${u.level})\n   💰 Total: *${formatRp(u.net_worth)}* • 🏆 ${u.wins}x Menang`
        }).join("\n\n")

        return await m.arashirep(
            `💎 *TOP 10 SULTAN TERKAYA (GLOBAL)*\n${LINE}\n${list}`
        )
    }

    if (!isGroup || arg === "global" || arg === "all") {
        const rows = getGlobalLeaderboard(10)
        if (!rows.length) return await m.arashirep("Belum ada data pemain di leaderboard global.")

        const list = rows.map((u, i) => {
            const badge = medals[i] || `*${i + 1}.*`
            return (
                `${badge} *${u.name}* — Lv.${u.level} ${getLevelBadge(u.level)}\n` +
                `   ✨ ${u.xp} XP • 🏆 ${u.wins}x Menang • 💰 ${formatRp(u.money + u.bank)}`
            )
        }).join("\n\n")

        return await m.arashirep(
            `🌍 *LEADERBOARD GLOBAL TOP 10*\n${LINE}\n${list}\n${LINE}\n` +
            `Ketik *lb* di dalam grup untuk melihat Leaderboard khusus grup tersebut!`
        )
    }

    const groupName = m.chat?.name || "Grup Ini"
    const { group, members } = getGroupLeaderboard(jid, 10)

    const header =
        `🏆 *LEADERBOARD GRUP — ${groupName.toUpperCase()}*\n${LINE}\n` +
        `📊 *Statistik Grup:*\n` +
        `• Total Game Dimainkan : *${group.total_games}x*\n` +
        `• Soal Terpecahkan     : *${group.total_solved}x*\n` +
        `• Total Hadiah Keluar  : *${formatRp(group.total_money_distributed)}*\n${LINE}\n`

    if (!members.length) {
        return await m.arashirep(
            `${header}Belum ada member yang mencetak poin di grup ini.\nYuk mulai main dengan ketik *asahotak*, *caklontong*, *family100*, atau *tebakgambar*!`
        )
    }

    const list = members.map((gm, i) => {
        const badge = medals[i] || `*${i + 1}.*`
        return (
            `${badge} *${gm.name}* (Lv.${gm.level || 1})\n` +
            `   ⭐ *${gm.points} Poin Grup* • 🏆 ${gm.wins}x Menang • 🎁 ${formatRp(gm.money_won)}`
        )
    }).join("\n\n")

    return await m.arashirep(
        `${header}${list}\n${LINE}\n` +
        `💡 Ketik *lb global* untuk Top Global atau *topmoney* untuk Top Sultan.`
    )
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, command, text } = ctx
    bindGameSocket(sock)

    const cmd = String(command || "").toLowerCase()
    if (cmd === "gameinit") return

    if (["hint", "bantuan", "clue", "bantu", "nyerah", "menyerah"].includes(cmd)) {
        if (!getActiveSession(jid)) {
            return await m.arashirep("⚠️ Sedang tidak ada sesi game yang aktif di chat ini. Ketik *game* untuk mulai bermain!")
        }
        await handleGameAnswer({ sock, m, jid, isCommand: true })
        return
    }

    // Jika command adalah salah satu kuis game
    if (CMD_TO_GAME[cmd]) {
        return await startQuizGame(ctx, CMD_TO_GAME[cmd])
    }

    if (cmd === "gslot" || cmd === "judislot" || cmd === "taruhan") {
        return await runSlotBet(ctx)
    }

    if (cmd === "daily" || cmd === "klaim") {
        return await runDailyClaim(ctx)
    }

    if (cmd === "bank" || cmd === "nabung" || cmd === "tarik") {
        return await runBank(ctx, cmd)
    }

    if (cmd === "tf" || cmd === "transfer" || cmd === "pay" || cmd === "kirim") {
        return await runTransfer(ctx)
    }

    if (cmd === "mygame" || cmd === "gprofile" || cmd === "dompet") {
        return await runProfile(ctx)
    }

    if (cmd === "topmoney" || cmd === "sultan") {
        return await runLeaderboard(ctx, "money")
    }

    if (cmd === "topglobal") {
        return await runLeaderboard(ctx, "global")
    }

    if (cmd === "lb" || cmd === "leaderboard" || cmd === "topgame") {
        return await runLeaderboard(ctx)
    }

    // Menu utama `game` / `games` + pengaturan `game on` / `game off`
    const sub = (text || "").trim().toLowerCase()
    if (sub === "on" || sub === "off") {
        if (!chatManager.isGroupJid(jid)) {
            return await m.arashirep("Perintah *game on/off* hanya untuk di dalam grup.")
        }
        if (!ctx.isOwner && !ctx.isAdmin) {
            return await m.arashirep("❌ Hanya Admin Grup atau Owner yang bisa mengubah pengaturan game grup.")
        }
        ensureGroup(jid, m.chat?.name || "Grup")
        const enabled = sub === "on" ? 1 : 0
        db.prepare("UPDATE groups SET game_enabled = ?, updated_at = ? WHERE group_id = ?")
            .run(enabled, Math.floor(Date.now() / 1000), jid)
        return await m.arashirep(
            enabled
                ? "✅ Fitur Game berhasil *DIAKTIFKAN* di grup ini!"
                : "🛑 Fitur Game telah *DINONAKTIFKAN* di grup ini."
        )
    }

    if (sub && CMD_TO_GAME[sub]) {
        return await startQuizGame(ctx, CMD_TO_GAME[sub])
    }

    return await m.arashirep(buildGameMenu())
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "game & economy system",
    commands: [
        "game", "games", "funmenu", "gameinit",
        "hint", "bantuan", "clue", "bantu", "nyerah", "menyerah",
        "asahotak", "ao",
        "caklontong", "cl",
        "family100", "f100",
        "tebakgambar", "tg",
        "tekateki",
        "susunkata", "sk",
        "siapakahaku", "sa",
        "tebakkata", "tk",
        "gslot", "judislot", "taruhan",
        "daily", "klaim",
        "bank", "nabung", "tarik",
        "tf", "transfer", "pay", "kirim",
        "mygame", "gprofile", "dompet",
        "lb", "leaderboard", "topgame", "topglobal", "topmoney", "sultan"
    ],
    categories: ["fun"],
    description: "Sistem Mini-Games Interaktif (Asah Otak, Cak Lontong, Family 100, Tebak Gambar, Teka-Teki, Susun Kata, Siapakah Aku, Tebak Kata, Slot) lengkap dengan Database SQLite Per-User & Per-Group"
}

plugin.meta = {
    filename: "game.js",
    version: "1.0.0",
    author: "Kado",
    note: "Integrasi Game Kuroneko + BochilTeam dengan database SQLite per-user & per-group (data/gamedb.db), deteksi jawaban real-time tanpa prefix, hint, similarity check, level/XP, bank, dan leaderboard per-grup",
    path: "fun"
}

export default plugin
