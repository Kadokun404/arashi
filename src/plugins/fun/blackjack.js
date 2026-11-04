/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import {
    db,
    LINE,
    formatRp,
    resolveUserIdentity,
    ensureUser,
    ensureGroup,
    ensureGroupMember,
    recordGameWin,
    isKadoUser
} from "#manager/game-manager.js"
import { chatManager } from "#manager/chat-manager.js"

// Map sesi game blackjack aktif: key = `${jid}:${userId}`
const bjSessions = (globalThis.__arashiBlackjackSessions ??= new Map())

const SUITS = [
    { sym: "♠", color: "black" },
    { sym: "♥", color: "red" },
    { sym: "♦", color: "red" },
    { sym: "♣", color: "black" }
]
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]

function createDeck() {
    const deck = []
    // 4 decks shoe
    for (let d = 0; d < 4; d++) {
        for (const s of SUITS) {
            for (const r of RANKS) {
                deck.push({ rank: r, suit: s.sym })
            }
        }
    }
    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    return deck
}

function drawCard(session) {
    if (!session.deck || session.deck.length < 15) {
        session.deck = createDeck()
    }
    return session.deck.pop()
}

function calcHand(hand) {
    let total = 0
    let aces = 0
    for (const c of hand) {
        if (c.rank === "A") {
            aces++
            total += 11
        } else if (["K", "Q", "J", "10"].includes(c.rank)) {
            total += 10
        } else {
            total += Number(c.rank)
        }
    }
    while (total > 21 && aces > 0) {
        total -= 10
        aces--
    }
    const isBlackjack = hand.length === 2 && total === 21
    const isBust = total > 21
    const isSoft = aces > 0 && total <= 21
    return { total, isSoft, isBlackjack, isBust }
}

function formatCard(card) {
    return `[ ${card.rank}${card.suit} ]`
}

function formatHand(hand, hideFirst = false) {
    if (!hand || hand.length === 0) return "-"
    if (hideFirst) {
        const visible = hand.slice(1).map(formatCard).join(" ")
        return `[ ? ] ${visible}`
    }
    return hand.map(formatCard).join(" ")
}

function getSessionKey(jid, userId) {
    return `${jid}:${userId}`
}

function clearSession(sessionKey) {
    const ses = bjSessions.get(sessionKey)
    if (ses?.timeout) clearTimeout(ses.timeout)
    bjSessions.delete(sessionKey)
}

/**
 * Handle Auto-Stand timeout (60 detik tidak ada respon)
 */
async function handleTimeout(sessionKey, sock) {
    const ses = bjSessions.get(sessionKey)
    if (!ses) return
    try {
        await executeStand(ses, sock, true)
    } catch (e) {
        console.error("[blackjack timeout error]:", e)
        clearSession(sessionKey)
    }
}

/**
 * Tampilkan tampilan status kartu pemain & dealer
 */
function renderBoard(ses, statusText = "") {
    const pVal = calcHand(ses.playerHand)
    const pTotalStr = pVal.isSoft && pVal.total < 21
        ? `${pVal.total - 10} / ${pVal.total}`
        : `${pVal.total}`

    let dStr = ""
    if (ses.dealerHoleHidden) {
        const visibleVal = calcHand(ses.dealerHand.slice(1)).total
        dStr = `${formatHand(ses.dealerHand, true)}  *(Total: ? + ${visibleVal})*`
    } else {
        const dVal = calcHand(ses.dealerHand)
        dStr = `${formatHand(ses.dealerHand, false)}  *(Total: ${dVal.total}${dVal.isBust ? " - BUST" : ""})*`
    }

    let text =
        `🃏 *BLACKJACK (21)*\n${LINE}\n` +
        `*Dealer:* ${dStr}\n` +
        `*Kamu:*   ${formatHand(ses.playerHand, false)}  *(Total: ${pTotalStr})*\n${LINE}\n` +
        `• Pemain  : *${ses.userName}*\n` +
        `• Taruhan : *${formatRp(ses.bet)}*\n`

    if (statusText) {
        text += `${statusText}`
    }

    return text
}

/**
 * Eksekusi giliran Dealer setelah pemain Stand (Penentuan Pemenang)
 */
async function executeStand(ses, sock, isAuto = false) {
    const { jid, userId, userName, userPn, bet, isGroup, sessionKey, playerHand } = ses
    if (ses.timeout) clearTimeout(ses.timeout)

    // Buka kartu tertutup dealer
    ses.dealerHoleHidden = false

    // Dealer draw sampai total >= 17
    let dVal = calcHand(ses.dealerHand)
    while (dVal.total < 17) {
        ses.dealerHand.push(drawCard(ses))
        dVal = calcHand(ses.dealerHand)
    }

    const pVal = calcHand(playerHand)
    const pTotal = pVal.total
    const dTotal = dVal.total
    const now = Math.floor(Date.now() / 1000)

    let resultMsg = ""
    let rewardMoney = 0
    let pointsWon = 0
    let xpWon = 0

    if (pVal.isBlackjack) {
        // Pemain Natural Blackjack (21 dengan 2 kartu awal)
        if (dVal.isBlackjack) {
            // Push
            rewardMoney = bet
            resultMsg =
                `🤝 *PUSH! KEDUANYA BLACKJACK!*\n` +
                `• Hasil   : Kamu (21) vs Dealer (21)\n` +
                `• Kembali : *${formatRp(bet)}* (Tanpa kerugian)`
        } else {
            // Natural Blackjack bayar 3:2 (profit 150%)
            const profit = Math.floor(bet * 1.5)
            rewardMoney = bet + profit
            pointsWon = 30
            xpWon = 50
            resultMsg =
                `🌟 *NATURAL BLACKJACK! (3:2 PAYOUT)* 👑\n` +
                `• Hasil   : Kamu Blackjack (21) vs Dealer (${dTotal})\n` +
                `• Hadiah  : *+${formatRp(profit)}* (+150% Profit)`
        }
    } else if (dVal.isBust) {
        // Dealer Bust -> Player Menang 1:1
        rewardMoney = bet * 2
        pointsWon = 15
        xpWon = 25
        resultMsg =
            `🎉 *DEALER BUST! KAMU MENANG!* 🥳\n` +
            `• Hasil   : Dealer (${dTotal}) melebihi 21\n` +
            `• Hadiah  : *+${formatRp(bet)}* (Profit 100%)`
    } else if (pTotal > dTotal) {
        // Player lebih tinggi -> Player Menang 1:1
        rewardMoney = bet * 2
        pointsWon = 15
        xpWon = 25
        resultMsg =
            `🎉 *KAMU MENANG!* 🥳\n` +
            `• Hasil   : Kamu (${pTotal}) vs Dealer (${dTotal})\n` +
            `• Hadiah  : *+${formatRp(bet)}* (Profit 100%)`
    } else if (pTotal < dTotal) {
        // Dealer lebih tinggi -> Player Kalah
        rewardMoney = 0
        resultMsg =
            `💀 *DEALER MENANG!* 🥲\n` +
            `• Hasil   : Kamu (${pTotal}) vs Dealer (${dTotal})\n` +
            `• Kalah   : *-${formatRp(bet)}*`
    } else {
        // Seri (Push) -> Kembalikan taruhan
        rewardMoney = bet
        resultMsg =
            `🤝 *PUSH! HASIL SERI*\n` +
            `• Hasil   : Skor sama (${pTotal} vs ${dTotal})\n` +
            `• Kembali : *${formatRp(bet)}* (Tanpa kerugian)`
    }

    if (isAuto) {
        resultMsg += `\n_(Otomatis Stand karena 60 detik tidak merespon)_`
    }

    let finalBalance = 0
    if (rewardMoney > bet) {
        // Menang profit
        const winRes = recordGameWin({
            groupId: isGroup ? jid : null,
            userId,
            userName,
            pn: userPn,
            gameType: "blackjack",
            money: rewardMoney,
            points: pointsWon,
            xp: xpWon,
            incrementGroupSolved: true
        })
        finalBalance = Number(winRes.user.money) || 0
    } else if (rewardMoney === bet) {
        // Push (kembalikan taruhan awal)
        db.prepare("UPDATE users SET money = money + ?, updated_at = ? WHERE user_id = ?")
            .run(bet, now, userId)
        const updated = db.prepare("SELECT money FROM users WHERE user_id = ?").get(userId)
        finalBalance = Number(updated?.money) || 0
    } else {
        // Kalah
        db.prepare("UPDATE users SET streak = 0 WHERE user_id = ?").run(userId)
        const updated = db.prepare("SELECT money FROM users WHERE user_id = ?").get(userId)
        finalBalance = Number(updated?.money) || 0
    }

    resultMsg += `\n• Saldo   : *${formatRp(finalBalance)}*\n${LINE}\n` +
        `💡 Ketik *bj ${bet}* untuk main lagi!`

    const finalText = renderBoard(ses, resultMsg)
    clearSession(sessionKey)

    await sock.sendMessage(jid, { text: finalText })
}

/**
 * Fungsi utama plugin Blackjack
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, jid, m, text, command } = ctx
    const { userId, pn, name } = resolveUserIdentity(m)
    const sessionKey = getSessionKey(jid, userId)
    const activeSes = bjSessions.get(sessionKey)

    const cmd = (command || "").toLowerCase()
    const rawText = (text || "").trim().toLowerCase()
    const fullMsg = (m.text || "").trim().toLowerCase()
    const firstWord = rawText.split(/\s+/)[0] || fullMsg.split(/\s+/)[0] || ""

    // Cek apakah pesan ini me-reply langsung pesan blackjack dari bot
    const isReplyingToBj = Boolean(
        m.q && activeSes && (
            (activeSes.msgId && (m.q.key?.id === activeSes.msgId || String(m.q.key?.id).toLowerCase() === String(activeSes.msgId).toLowerCase())) ||
            (m.q.key?.fromMe && m.q.text && m.q.text.includes("BLACKJACK (21)"))
        )
    )

    // ========================================================
    // 1. CEK AKSI IN-GAME: HIT, STAND, DOUBLE, SURRENDER
    // ========================================================
    const matchesHit = ["hit", "h", "ambil", "tambah"].includes(cmd) ||
                       ["hit", "h", "ambil", "tambah"].includes(firstWord) ||
                       (isReplyingToBj && fullMsg.startsWith("hit")) ||
                       (isReplyingToBj && fullMsg === "h")

    const matchesStand = ["stand", "s", "tahan", "pas", "stay"].includes(cmd) ||
                         ["stand", "s", "tahan", "pas", "stay"].includes(firstWord) ||
                         (isReplyingToBj && fullMsg.startsWith("stand")) ||
                         (isReplyingToBj && fullMsg === "s")

    const matchesDouble = ["double", "d", "ganda", "dd"].includes(cmd) ||
                          ["double", "d", "ganda", "dd"].includes(firstWord) ||
                          (isReplyingToBj && fullMsg.startsWith("double")) ||
                          (isReplyingToBj && fullMsg === "d")

    const matchesFold = ["fold", "nyerah", "stop", "menyerah"].includes(cmd) ||
                        ["fold", "nyerah", "stop", "menyerah"].includes(firstWord) ||
                        (isReplyingToBj && ["fold", "nyerah", "stop"].includes(fullMsg))

    // Jika user mengetik hit/stand/double tapi tidak punya game aktif:
    if (!activeSes && (matchesHit || matchesStand || matchesDouble)) {
        if (!ctx.result?.prefixOk) return // Abaikan teks biasa tanpa prefix
        return await m.arashirep(
            `⚠️ Kamu belum memiliki sesi Blackjack yang aktif!\n` +
            `Ketik *bj <taruhan>* untuk mulai bermain (contoh: *bj 200*).`
        )
    }

    // --- AKSI: HIT ---
    if (matchesHit && activeSes) {
        if (activeSes.timeout) clearTimeout(activeSes.timeout)

        const newCard = drawCard(activeSes)
        activeSes.playerHand.push(newCard)

        const pVal = calcHand(activeSes.playerHand)

        if (pVal.isBust) {
            // Pemain BUST (> 21)
            activeSes.dealerHoleHidden = false
            const now = Math.floor(Date.now() / 1000)
            db.prepare("UPDATE users SET streak = 0 WHERE user_id = ?").run(activeSes.userId)
            const updated = db.prepare("SELECT money FROM users WHERE user_id = ?").get(activeSes.userId)
            const finalBal = Number(updated?.money) || 0

            const bustMsg =
                `💥 *BUST! KARTU MELEBIHI 21!* 😵\n` +
                `• Kartu Baru : ${formatCard(newCard)}\n` +
                `• Kalah      : *-${formatRp(activeSes.bet)}*\n` +
                `• Sisa Saldo : *${formatRp(finalBal)}*\n${LINE}\n` +
                `💡 Ketik *bj ${activeSes.bet}* untuk main lagi!`

            const finalText = renderBoard(activeSes, bustMsg)
            clearSession(sessionKey)
            return await sock.sendMessage(jid, { text: finalText }, { quoted: m })
        }

        // Masih di bawah atau pas 21: tunggu keputusan pemain lagi (hit atau stand)
        activeSes.timeout = setTimeout(() => handleTimeout(sessionKey, sock), 60000)

        const promptText =
            `• Kartu Baru : ${formatCard(newCard)}\n\n` +
            `👉 *Balas/Reply pesan ini:*\n` +
            `• Ketik *hit* (ambil kartu lagi)\n` +
            `• Ketik *stand* (tahan & tentukan pemenang)`

        const board = renderBoard(activeSes, promptText)
        const sent = await sock.sendMessage(jid, { text: board }, { quoted: m })
        activeSes.msgId = sent?.key?.id
        return
    }

    // --- AKSI: STAND ---
    if (matchesStand && activeSes) {
        return await executeStand(activeSes, sock)
    }

    // --- AKSI: DOUBLE DOWN ---
    if (matchesDouble && activeSes) {
        if (activeSes.playerHand.length !== 2) {
            return await m.arashirep("⚠️ Double Down hanya bisa dilakukan saat baru memiliki 2 kartu awal!")
        }

        const user = db.prepare("SELECT money FROM users WHERE user_id = ?").get(activeSes.userId)
        const curBal = Number(user?.money) || 0
        const isKado = isKadoUser(userId, pn)

        if (!isKado && curBal < activeSes.bet) {
            return await m.arashirep(
                `❌ Saldo tidak cukup untuk Double Down!\n` +
                `• Tambahan Taruhan: ${formatRp(activeSes.bet)}\n` +
                `• Saldo Kamu      : ${formatRp(curBal)}`
            )
        }

        if (activeSes.timeout) clearTimeout(activeSes.timeout)

        // Potong tambahan saldo
        const now = Math.floor(Date.now() / 1000)
        db.prepare("UPDATE users SET money = money - ?, updated_at = ? WHERE user_id = ?")
            .run(activeSes.bet, now, activeSes.userId)

        activeSes.bet *= 2

        // Ambil tepat 1 kartu tambahan
        const newCard = drawCard(activeSes)
        activeSes.playerHand.push(newCard)

        const pVal = calcHand(activeSes.playerHand)
        if (pVal.isBust) {
            activeSes.dealerHoleHidden = false
            db.prepare("UPDATE users SET streak = 0 WHERE user_id = ?").run(activeSes.userId)
            const updated = db.prepare("SELECT money FROM users WHERE user_id = ?").get(activeSes.userId)
            const finalBal = Number(updated?.money) || 0

            const bustMsg =
                `💥 *BUST SETELAH DOUBLE DOWN!* 😵\n` +
                `• Kartu Baru : ${formatCard(newCard)}\n` +
                `• Kalah      : *-${formatRp(activeSes.bet)}*\n` +
                `• Sisa Saldo : *${formatRp(finalBal)}*\n${LINE}\n` +
                `💡 Ketik *bj* untuk mulai ronde baru!`

            const finalText = renderBoard(activeSes, bustMsg)
            clearSession(sessionKey)
            return await sock.sendMessage(jid, { text: finalText }, { quoted: m })
        }

        // Setelah double down otomatis stand dan giliran dealer
        return await executeStand(activeSes, sock)
    }

    // --- AKSI: SURRENDER / FOLD ---
    if (matchesFold && activeSes) {
        if (activeSes.timeout) clearTimeout(activeSes.timeout)
        const refund = Math.floor(activeSes.bet / 2)
        const now = Math.floor(Date.now() / 1000)

        db.prepare("UPDATE users SET money = money + ?, updated_at = ? WHERE user_id = ?")
            .run(refund, now, activeSes.userId)

        const updated = db.prepare("SELECT money FROM users WHERE user_id = ?").get(activeSes.userId)
        const finalBal = Number(updated?.money) || 0

        clearSession(sessionKey)
        return await m.arashirep(
            `🏳️ *KAMU MENYERAH (SURRENDER)*\n${LINE}\n` +
            `• Taruhan Awal : ${formatRp(activeSes.bet)}\n` +
            `• Dikembalikan : *${formatRp(refund)}* (50%)\n` +
            `• Sisa Saldo   : *${formatRp(finalBal)}*`
        )
    }

    // ========================================================
    // 2. CEK SESI YANG MASIH BERJALAN
    // ========================================================
    if (activeSes) {
        return await m.arashirep(
            `⚠️ Kamu masih punya sesi Blackjack yang sedang aktif!\n` +
            `👉 *Balas/Reply pesan game bot:* ketik *hit* atau *stand*!`
        )
    }

    // ========================================================
    // 3. START GAME BARU: bj <taruhan>
    // ========================================================
    const user = ensureUser(userId, name, pn)
    const balance = Number(user.money) || 0
    const isKado = isKadoUser(userId, pn)

    const rawArg = (text || "").trim().split(/\s+/)[0]?.toLowerCase()

    // Jika tidak memasukkan taruhan, tampilkan info & panduan
    if (!rawArg) {
        return await m.arashirep(
            `🃏 *BLACKJACK (21)*\n${LINE}\n` +
            `• Saldo Kamu : *${formatRp(balance)}*\n` +
            `• Min Taruhan: *${formatRp(100)}*\n` +
            `• Max Taruhan: *${formatRp(500000)}*\n\n` +
            `*Cara Bermain:*\n` +
            `• *bj <jumlah>*  — Pasang taruhan (contoh: *bj 200* atau *bj all*)\n` +
            `• Balas/Reply pesan bot lalu ketik:\n` +
            `  - *hit* (h)    : Ambil 1 kartu tambahan\n` +
            `  - *stand* (s)  : Tahan kartu & tentukan pemenang\n` +
            `  - *double* (d) : Gandakan taruhan (1 kartu terakhir)\n\n` +
            `💡 _Dekati angka 21 tanpa melebihinya untuk mengalahkan Dealer!_`
        )
    }

    const maxLimit = isKado ? 1000000000 : 500000
    const bet = rawArg === "all" || rawArg === "max"
        ? Math.min(balance, maxLimit)
        : Number(rawArg)

    if (!Number.isSafeInteger(bet) || bet < 100 || (!isKado && bet > maxLimit)) {
        return await m.arashirep(
            `❌ *Jumlah taruhan tidak valid!*\n` +
            `• Minimal : *${formatRp(100)}*\n` +
            `• Maksimal: *${formatRp(maxLimit)}*\n` +
            `• Saldo   : *${formatRp(balance)}*\n\n` +
            `Contoh: *bj 200* atau *bj 5000*`
        )
    }

    if (!isKado && balance < bet) {
        return await m.arashirep(
            `❌ *Saldo kamu tidak cukup!*\n` +
            `• Taruhan : ${formatRp(bet)}\n` +
            `• Saldo   : ${formatRp(balance)}\n\n` +
            `💡 Ketik *daily* untuk klaim modal harian!`
        )
    }

    // Potong taruhan dari database
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

    // Inisialisasi sesi game
    const deck = createDeck()
    const playerHand = [deck.pop(), deck.pop()]
    const dealerHand = [deck.pop(), deck.pop()]

    const session = {
        sessionKey,
        jid,
        userId: user.user_id,
        userName: name,
        userPn: pn,
        bet,
        isGroup,
        deck,
        playerHand,
        dealerHand,
        dealerHoleHidden: true,
        startedAt: Date.now(),
        msgId: null,
        timeout: null
    }

    // Set timeout 60 detik jika pemain tidak merespon (otomatis stand)
    session.timeout = setTimeout(() => handleTimeout(sessionKey, sock), 60000)
    bjSessions.set(sessionKey, session)

    // Tampilkan papan kartu awal dan minta pemain reply hit atau stand
    const promptText =
        `👉 *Balas/Reply pesan ini:*\n` +
        `• Ketik *hit* (ambil kartu lagi)\n` +
        `• Ketik *stand* (tahan & tentukan pemenang)\n` +
        `• Ketik *double* (gandakan taruhan & 1 kartu)`

    const board = renderBoard(session, promptText)
    const sent = await sock.sendMessage(jid, { text: board }, { quoted: m })
    session.msgId = sent?.key?.id
    return
}

/** @type {PluginType} */
const plugin = {
    run,
    name: "Blackjack 21",
    commands: ["blackjack", "bj", "hit", "h", "stand", "s", "double", "d"],
    categories: ["fun"],
    description: "Mainkan game kartu Blackjack 21 taruhan teks bersih & interaktif via reply",
    config: {
        protected: false,
        bypassPrefix: true // Supaya user bisa reply hit / stand tanpa prefix
    }
}

plugin.meta = {
    filename: "blackjack.js",
    version: "2.1.0",
    author: "Kadokun",
    note: "Game kartu Blackjack 21 berbasis teks, user reply hit/stand baru hasil ditentukan",
    path: "fun"
}

export default plugin
