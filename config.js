import "dotenv/config"

const config = {
    BOT_PHONE_NUMBER: process.env.BOT_PHONE_NUMBER || "628xxxxxxxxxx",
    PAIRING_CODE: "PPPPPPPP",
    botName: "Arashi Base",
    botNumb: process.env.BOT_PHONE_NUMBER || "628xxxxxxxxxx",
    menuTitle: "Arashi",
    menuDesc: "",
    menuUrl: "https://ai.kadokundesu.com",
    devName: "Kadokun",
    devNumb: ["6287867140397"],
    devTeleId: [],
    TIME_ZONE: "Asia/Makassar"
}

export { config }
