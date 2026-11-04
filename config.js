import "dotenv/config"

/**
 * Konfigurasi Utama Bot Arashi
 * Sesuaikan nomor telepon, nama bot, dan API key sebelum menjalankan bot.
 */
const config = {
    apikey: {
        github: process.env.GITHUB_API_KEY || "",
        theresav: process.env.THERESAV_API_KEY || ""
    },

    // Nomor WhatsApp bot (format internasional tanpa tanda +, contoh: 628123456789)
    BOT_PHONE_NUMBER: process.env.BOT_PHONE_NUMBER || "6288356912654",

    // Pairing code mode
    PAIRING_CODE: "PPPPPPPP",

    botName: "Arashi",
    botNumb: process.env.BOT_PHONE_NUMBER || "6288356912654",

    // Tampilan Menu
    menuTitle: "Arashi",
    menuDesc: "Arashi Modular WhatsApp Bot Base",
    menuUrl: "https://github.com/Kadokun404/arashi",

    // Developer / Owner
    devName: "Kadokun",
    devNumb: ["6287867140397"],
    TIME_ZONE: "Asia/Jakarta",

    // QRIS Payment Config (Opsional)
    QRIS_API_BASE: process.env.QRIS_API_BASE || "https://qris.kadokunn.com",
    QRIS_API_TOKEN: process.env.QRIS_API_TOKEN || "",
    QRIS_UNIQUE_CODE_MAX: 0,
    QRIS_STORE_PROFILE: {
        nama: "Arashi Store",
        alamat: "Indonesia",
        kota: "Jakarta",
        telp: "@arashi"
    },
    QRIS_KV_URL: process.env.QRIS_KV_URL || "",
    QRIS_KV_TOKEN: process.env.QRIS_KV_TOKEN || "",

    // Token GitHub untuk menghindari rate limit API pencarian
    GITHUB_TOKEN: process.env.GITHUB_API_KEY || ""
}

export {
    config
}
