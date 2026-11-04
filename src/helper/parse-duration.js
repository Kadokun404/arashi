const UNIT_MS = {
    d: 24 * 60 * 60 * 1000, hari: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000, j: 60 * 60 * 1000, jam: 60 * 60 * 1000,
    m: 60 * 1000, menit: 60 * 1000,
    s: 1000, detik: 1000, dtk: 1000
}

// urutan kata unit di paling akhir biar "menit"/"detik" gak ke-cut jadi "m"/"d" duluan pas regex jalan
const UNIT_PATTERN = Object.keys(UNIT_MS).sort((a, b) => b.length - a.length).join("|")
const TOKEN_REGEX = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})`, "gi")

/**
 * parse durasi dari teks bebas ke milidetik. support gabungan (contoh "1h30m", "1 jam 30 menit"),
 * satuan: d/hari, h/j/jam, m/menit, s/detik/dtk
 * @param {string|undefined} text
 * @returns {number|null} milidetik, null kalau gak ada durasi valid yang ke detect
 */
function parseDurationMs(text) {
    if (!text) return null

    let totalMs = 0
    let matched = false

    for (const match of text.matchAll(TOKEN_REGEX)) {
        const value = parseFloat(match[1].replace(",", "."))
        const unit = match[2].toLowerCase()
        if (isNaN(value) || !UNIT_MS[unit]) continue
        totalMs += value * UNIT_MS[unit]
        matched = true
    }

    return matched ? totalMs : null
}

export { parseDurationMs }
