import "dotenv/config"

/**
 * konfigurasi statis bot. secret diambil dari .env
 */
const config = {
    apikey: {
        github: process.env.GITHUB_API_KEY,
        theresav: process.env.THERESAV_API_KEY
    },
    BOT_PHONE_NUMBER: process.env.BOT_PHONE_NUMBER || "",
    PAIRING_CODE: "PPPPPPPP",

    botName: "Arashi",
    botNumb: process.env.BOT_PHONE_NUMBER || "",

    menuTitle: "Arashi",
    menuDesc: "Selamat datang di menu Arashi✨",
    menuUrl: "",

    devName: "",
    devNumb: (process.env.OWNER_NUMBERS || "").split(",").map(s => s.trim()).filter(Boolean),
    TIME_ZONE: "Asia/Makassar",

    QRIS_API_BASE: process.env.QRIS_API_BASE || "",
    QRIS_API_TOKEN: process.env.QRIS_API_TOKEN || "",
    QRIS_UNIQUE_CODE_MAX: 0,
    QRIS_STORE_PROFILE: { nama: "", alamat: "", kota: "", telp: "" },
    QRIS_KV_URL: process.env.QRIS_KV_URL || "",
    QRIS_KV_TOKEN: process.env.QRIS_KV_TOKEN || "",

    GITHUB_TOKEN: process.env.GITHUB_TOKEN || ""
}

export { config }
