import { config } from "#root/config.js"

/**
 * format tanggal sekarang jadi dd-mm-yyyy sesuai timezone di config.js
 * @param {Date} [date] optional, default nya Date sekarang
 * @returns {string} contoh "08-07-2026"
 */
const formatDateDDMMYYYY = (date = new Date()) => {
    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: config.TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    })

    // en-GB formatnya dd/mm/yyyy, kita tinggal ganti separatornya
    return formatter.format(date).replaceAll("/", "-")
}

export { formatDateDDMMYYYY }
