/**
 * Laporan pendapatan GoPay/QRIS (khusus owner).
 *
 *   .balance                 pendapatan bulan ini
 *   .balance bulan lalu
 *   .balance bulan 3         bulan 1-12 (tahun ini, atau tahun lalu kalau bulannya belum terjadi)
 *   .balance bulan 3 2025    bulan + tahun
 *   .balance oktober         nama bulan juga bisa
 *
 * Satu file, gak ada yang diubah di gateway. Data diambil langsung dari GoBiz pakai sesi login
 * yang disimpan scripts/login-otp.mjs di Upstash KV. Butuh di config.js:
 *   QRIS_KV_URL, QRIS_KV_TOKEN (token Read-Only cukup), plus QRIS_API_BASE / QRIS_API_TOKEN yang
 *   sudah ada (dipakai buat nyuruh gateway refresh sesi kalau token GoBiz sudah kedaluwarsa).
 *
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { config } from "#root/config.js"

const SESSION_KEY = "gobiz:session" // sama dengan lib/token-store.js di gateway
const ANALYTICS_URL = "https://api.gojekapi.com/merchant-analytics/v2/merchants/transactions"
const PAGE_SIZE = 50
const MAX_PAGES = 30
const DIV = "━━━━━━━━━━━━━━"

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]

const rupiah = (n) => "Rp" + Math.round(n).toLocaleString("id-ID")
const tz = () => config.TIME_ZONE || "Asia/Makassar"

// ---------- zona waktu (tanpa library) ----------

const partsOf = (date) => {
    const p = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
            timeZone: tz(), hourCycle: "h23",
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit"
        }).formatToParts(date).map((x) => [x.type, x.value])
    )
    return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second }
}

/** instant (Date) untuk jam 00:00 tanggal y-m-d di zona waktu config */
const startOfDay = (y, m, d) => {
    const guess = Date.UTC(y, m - 1, d)
    const p = partsOf(new Date(guess))
    const offset = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - guess
    return new Date(guess - offset)
}

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const prevMonth = ({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 })
const nextMonth = ({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 })

// ---------- baca argumen ----------

/** @returns {{y: number, m: number} | {error: string}} */
function parsePeriod(raw, now) {
    const cur = { y: partsOf(now).y, m: partsOf(now).m }
    const tokens = String(raw || "").toLowerCase().replace(/[,.]/g, " ").split(/\s+/).filter(Boolean)
        .filter((t) => t !== "bulan")

    if (!tokens.length || tokens[0] === "ini") return cur
    if (tokens[0] === "lalu") return prevMonth(cur)

    let month = NaN
    if (/^\d{1,2}$/.test(tokens[0])) {
        month = parseInt(tokens[0], 10)
    } else if (tokens[0] === "agt") {
        month = 8
    } else if (tokens[0].length >= 3) {
        month = MONTHS.findIndex((n) => n.toLowerCase().startsWith(tokens[0])) + 1 || NaN
    }
    if (!(month >= 1 && month <= 12)) return { error: "Bulan harus 1-12 atau nama bulan, contoh: .balance bulan 3" }

    let year = cur.y
    if (tokens[1]) {
        if (!/^\d{4}$/.test(tokens[1]) || +tokens[1] < 2000 || +tokens[1] > 2100) return { error: "Tahun gak valid, contoh: .balance bulan 3 2025" }
        year = +tokens[1]
    } else if (month > cur.m) {
        year -= 1 // bulan itu belum terjadi di tahun ini, berarti maksudnya tahun lalu
    }

    if (year > cur.y || (year === cur.y && month > cur.m)) return { error: "Bulan itu belum terjadi." }
    return { y: year, m: month }
}

// ---------- ambil data dari GoBiz ----------

class SessionExpired extends Error { }

async function loadSession() {
    if (!config.QRIS_KV_URL || !config.QRIS_KV_TOKEN) {
        throw new Error("QRIS_KV_URL / QRIS_KV_TOKEN belum diisi di config.js")
    }
    const res = await fetch(config.QRIS_KV_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.QRIS_KV_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(["GET", SESSION_KEY]),
        signal: AbortSignal.timeout(10000)
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`KV ${res.status} ${json?.error ?? ""}`.trim())
    if (!json.result) throw new Error("Sesi GoBiz belum ada di KV, jalankan scripts/login-otp.mjs di gateway.")
    const session = JSON.parse(json.result)
    if (!session.access_token || !session.merchant_id) throw new Error("Isi sesi di KV gak lengkap, login OTP ulang.")
    return session
}

/** suruh gateway refresh sesinya (dia yang nyimpen token baru ke KV), abaikan hasilnya */
async function nudgeGateway() {
    if (!config.QRIS_API_BASE || !config.QRIS_API_TOKEN) return
    const qs = new URLSearchParams({ amount: "1", created_at: new Date().toISOString() })
    await fetch(`${String(config.QRIS_API_BASE).replace(/\/+$/, "")}/api/gopay/status?${qs}`, {
        headers: { "x-internal-token": config.QRIS_API_TOKEN },
        signal: AbortSignal.timeout(20000)
    }).catch(() => { })
}

async function fetchPage(session, from, startTime, endTime) {
    const url = new URL(ANALYTICS_URL)
    url.searchParams.set("from", String(from))
    url.searchParams.set("size", String(PAGE_SIZE))
    url.searchParams.set("statuses", "SETTLEMENT,CAPTURE,REFUND,PARTIAL_REFUND")
    url.searchParams.set("payment_types", "QRIS,GOPAY,OFFLINE_CREDIT_CARD,OFFLINE_DEBIT_CARD,CREDIT_CARD")
    url.searchParams.set("start_time", startTime)
    url.searchParams.set("end_time", endTime)
    url.searchParams.set("merchant_ids", session.merchant_id)

    const res = await fetch(url, {
        headers: {
            "accept": "application/json, text/plain, */*",
            "authentication-type": "go-id",
            "authorization": `Bearer ${session.access_token}`,
            "content-type": "application/json"
        },
        signal: AbortSignal.timeout(20000)
    })
    if (res.status === 401) throw new SessionExpired("401")
    if (!res.ok) throw new Error(`GoBiz ${res.status} ${res.statusText}`)
    const data = await res.json()
    return Array.isArray(data?.transactions) ? data.transactions : []
}

const isRefund = (tx) => /REFUND/i.test(String(tx.status ?? tx.transaction_status ?? tx.payment_status ?? tx.settlement_status ?? ""))

/** semua transaksi di rentang [from, to), halaman demi halaman */
async function fetchRange(session, from, to) {
    const all = []
    let prevKey = null
    let stuck = false
    let pages = 0

    for (let page = 0; page < MAX_PAGES; page++) {
        const txs = await fetchPage(session, page * PAGE_SIZE, from.toISOString(), to.toISOString())
        if (!txs.length) break
        const key = JSON.stringify(txs[0])
        if (key === prevKey) { stuck = true; break } // GoBiz gak menggeser halaman, jangan dobel hitung
        prevKey = key
        all.push(...txs)
        pages++
        if (txs.length < PAGE_SIZE) return { txs: all, truncated: false, stuck }
    }
    return { txs: all, truncated: !stuck && pages >= MAX_PAGES, stuck }
}

/** coba sekali lagi setelah gateway refresh kalau token GoBiz sudah kedaluwarsa */
async function getRange(from, to, state) {
    try {
        return await fetchRange(state.session, from, to)
    } catch (e) {
        if (!(e instanceof SessionExpired) || state.refreshed) throw e
        state.refreshed = true
        await nudgeGateway()
        state.session = await loadSession()
        try {
            return await fetchRange(state.session, from, to)
        } catch (e2) {
            if (e2 instanceof SessionExpired) {
                throw new Error("Sesi GoBiz kedaluwarsa. Jalankan `node scripts/login-otp.mjs` di folder gateway, lalu coba lagi.")
            }
            throw e2
        }
    }
}

// ---------- hitung ----------

/** ringkas transaksi yang jatuh di [from, to) menurut zona waktu config, dibatasi sampai tanggal maxDay */
function summarize(txs, from, to, maxDay = 31) {
    const perDay = new Map() // tanggal -> { total, count }
    let income = 0, refund = 0, count = 0

    for (const tx of txs) {
        const amount = typeof tx.gross_amount === "number" ? tx.gross_amount / 100 : NaN
        const when = new Date(tx.transaction_time)
        if (!Number.isFinite(amount) || Number.isNaN(when.getTime())) continue
        if (when < from || when >= to) continue
        const day = partsOf(when).d
        if (day > maxDay) continue

        if (isRefund(tx)) { refund += amount; continue }
        income += amount
        count++
        const d = perDay.get(day) ?? { total: 0, count: 0 }
        d.total += amount
        d.count++
        perDay.set(day, d)
    }
    return { income, refund, net: income - refund, count, perDay }
}

// ---------- tampilan ----------

const bar = (value, max, width = 10) => {
    const n = max > 0 ? Math.round((value / max) * width) : 0
    return "█".repeat(n) + "░".repeat(width - n)
}

function buildReport({ period, sum, prev, prevPeriod, cutoffDay, isCurrent, todayDay, flags, now }) {
    const title = `${MONTHS[period.m - 1]} ${period.y}`
    if (sum.count === 0 && sum.refund === 0) {
        return `*PENDAPATAN ${title.toUpperCase()}*\n${DIV}\nBelum ada pemasukan di ${title}.`
    }

    const lines = [`*📊 PENDAPATAN ${title.toUpperCase()}*`, DIV]
    lines.push(`Total masuk   : *${rupiah(sum.net)}*`)
    if (sum.refund > 0) lines.push(`Refund        : ${rupiah(sum.refund)} (sudah dikurangi)`)
    lines.push(`Transaksi     : ${sum.count}`)
    lines.push(`Rata-rata     : ${rupiah(sum.count ? sum.income / sum.count : 0)}`)

    let best = null
    for (const [day, v] of sum.perDay) if (!best || v.total > best.total) best = { day, ...v }
    if (best) lines.push(`Hari terbaik  : ${best.day} ${MONTH_SHORT[period.m - 1]} (${rupiah(best.total)})`)

    if (isCurrent) {
        const t = sum.perDay.get(todayDay)
        lines.push(`Hari ini      : ${t ? `${rupiah(t.total)} (${t.count} trx)` : "belum ada"}`)
    }

    // per minggu (1-7, 8-14, 15-21, 22-28, 29-akhir)
    const last = daysIn(period.y, period.m)
    const weeks = []
    for (let start = 1; start <= Math.min(last, cutoffDay); start += 7) {
        const end = start + 6 >= 29 ? last : start + 6
        let total = 0
        for (const [day, v] of sum.perDay) if (day >= start && day <= end) total += v.total
        weeks.push({ label: `${start}-${end}`, total })
        if (end === last) break
    }
    if (weeks.length > 1) {
        const max = Math.max(...weeks.map((w) => w.total))
        const lw = Math.max(...weeks.map((w) => w.label.length))
        const aw = Math.max(...weeks.map((w) => rupiah(w.total).length))
        lines.push(DIV, "*Per minggu*", "```")
        for (const w of weeks) lines.push(`${w.label.padEnd(lw)} ${bar(w.total, max)} ${rupiah(w.total).padStart(aw)}`)
        lines.push("```")
    }

    // banding dengan bulan sebelumnya (periode yang sama)
    if (prev && prev.net > 0) {
        const diff = ((sum.net - prev.net) / prev.net) * 100
        const pn = MONTHS[prevPeriod.m - 1]
        const span = isCurrent ? `1-${Math.min(cutoffDay, daysIn(prevPeriod.y, prevPeriod.m))} ${pn}` : pn
        const pct = Math.abs(diff).toLocaleString("id-ID", { maximumFractionDigits: 1 })
        lines.push(DIV, `${diff >= 0 ? "▲" : "▼"} ${pct}% dibanding ${span} (${rupiah(prev.net)})`)
    }

    if (flags.stuck) lines.push("", "⚠ GoBiz tidak menggeser halaman, angka mungkin cuma 50 transaksi pertama.")
    if (flags.truncated) lines.push("", "⚠ Transaksi terlalu banyak, data dipotong dan angka bisa kurang.")

    const clock = new Intl.DateTimeFormat("id-ID", { timeZone: tz(), timeStyle: "short" }).format(now)
    lines.push("", `_Data GoBiz • diperbarui ${clock}_`)
    return lines.join("\n")
}

// ---------- plugin ----------

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, text, isOwner } = ctx
    if (!isOwner) return await m.arashirep("Perintah ini khusus owner.")

    const now = new Date()
    const period = parsePeriod(text, now)
    if ("error" in period) return await m.arashirep(period.error)

    const cur = partsOf(now)
    const isCurrent = period.y === cur.y && period.m === cur.m
    const monthFrom = startOfDay(period.y, period.m, 1)
    const nm = nextMonth(period)
    const monthEnd = startOfDay(nm.y, nm.m, 1)
    const to = isCurrent && now < monthEnd ? now : monthEnd

    const pp = prevMonth(period)
    const prevFrom = startOfDay(pp.y, pp.m, 1)

    let state
    try {
        state = { session: await loadSession(), refreshed: false }
        const [main, prevRes] = await Promise.all([
            getRange(monthFrom, to, state),
            getRange(prevFrom, monthFrom, state).catch(() => null) // banding itu bonus, jangan bikin laporan gagal
        ])

        const cutoffDay = isCurrent ? cur.d : daysIn(period.y, period.m)
        const sum = summarize(main.txs, monthFrom, to)
        const prev = prevRes ? summarize(prevRes.txs, prevFrom, monthFrom, Math.min(cutoffDay, daysIn(pp.y, pp.m))) : null

        return await m.arashirep(buildReport({
            period, sum, prev, prevPeriod: pp, cutoffDay, isCurrent, todayDay: cur.d,
            flags: { stuck: main.stuck, truncated: main.truncated }, now
        }))
    } catch (e) {
        console.error("[balance] gagal:", e)
        return await m.arashirep(`Gagal mengambil data pendapatan.\n${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "Balance",
    commands: ["balance", "pendapatan"],
    categories: ["tools"],
    description: "Pendapatan GoPay/QRIS (owner). balance | balance bulan lalu | balance bulan 1-12 [tahun] | balance oktober"
}

plugin.meta = {
    filename: "balance.js",
    version: "1",
    author: config.devName || "Kado",
    note: "Satu file, baca langsung dari GoBiz pakai sesi di KV",
    path: "tools"
}

export default plugin