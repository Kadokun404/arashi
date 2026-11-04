import "dotenv/config"

/**
 * ==============================================================================
 *                     KONFIGURASI UTAMA ARASHI BOT BASE
 * ==============================================================================
 * File ini berisi seluruh pengaturan konfigurasi dasar bot.
 * Pengembang (user) dapat menambahkan konfigurasi baru, API key baru, atau nomor
 * sesuai kebutuhan bot yang ingin dikembangkan.
 */

const config = {
    /**
     * --------------------------------------------------------------------------
     * [ DAFTAR API KEY ]
     * --------------------------------------------------------------------------
     * Kamu (user) bisa menambahkan API key baru di objek apikey ini.
     * Nilainya bisa diambil dari file .env (rekomendasi keamanan) atau ditulis langsung.
     *
     * Contoh penambahan:
     * config.apikey = {
     *     github: process.env.GITHUB_API_KEY || "",
     *     myapikey: process.env.MY_API_KEY || "isi_key_kamu_disini",
     *     openai: process.env.OPENAI_API_KEY || "",
     *     gemini: process.env.GEMINI_API_KEY || "",
     *     anthropic: process.env.ANTHROPIC_API_KEY || "",
     * }
     *
     * Cara memanggilnya di dalam file plugin:
     * --------------------------------------------------------------------------
     * import { config } from "#root/config.js"
     * const key = config.apikey.myapikey
     * --------------------------------------------------------------------------
     */
    apikey: {
        github: process.env.GITHUB_API_KEY || "",
        myapikey: process.env.MY_API_KEY || "" // Contoh: ganti dengan key milikmu
    },

    // Nomor WhatsApp bot (format angka internasional tanpa tanda +, contoh: "628123456789")
    BOT_PHONE_NUMBER: process.env.BOT_PHONE_NUMBER || "628xxxxxxxxxx",

    // Pairing code default saat pairing login pertama kali
    PAIRING_CODE: "PPPPPPPP",

    // Identitas Nama & Nomor Bot
    botName: "Arashi",
    botNumb: process.env.BOT_PHONE_NUMBER || "628xxxxxxxxxx",

    // Tampilan Header Menu
    menuTitle: "Arashi Bot",
    menuDesc: "Modular WhatsApp Bot Base",
    menuUrl: "https://github.com/Kadokun404/arashi",

    // Identitas Developer / Owner Bot (masukkan nomor WA owner kamu di devNumb)
    devName: "Kadokun",
    devNumb: ["628xxxxxxxxxx"],

    // Zona Waktu (WIB: Asia/Jakarta, WITA: Asia/Makassar, WIT: Asia/Jayapura)
    TIME_ZONE: "Asia/Jakarta"
}

export {
    config
}
