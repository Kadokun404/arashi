import path from "node:path"

const srcDir = path.resolve(import.meta.dirname, "..")
const rootDir = path.resolve(srcDir, "..")

const allPaths = {
    root: path.join(srcDir, "/"),
    // dir
    baileysAuth : path.join(rootDir, "auth"),
    plugins: path.join(srcDir, "plugins"),
    temp: path.join(srcDir, "temp"),

    // file
    prefix : path.join(rootDir, "data/prefix-config.json"),
    database : path.join(rootDir, "data/database.db"),
    trustDb : path.join(rootDir, "data/trust.json"),
    pamDb : path.join(rootDir, "data/pam.json"),
    debugConfig : path.join(rootDir, "data/debug-config.json"),
    themeConfig : path.join(rootDir, "data/theme-config.json"),
    restartFlag : path.join(rootDir, "data/restart-flag.json"),
    chatManagerConfig : path.join(rootDir, "data/chat-manager-config.json"),
    antilinkConfig : path.join(rootDir, "data/antilink-config.json"),
    groupOpenCloseConfig : path.join(rootDir, "data/group-open-close-config.json"),
    aliasConfig: path.join(rootDir, "data/alias.json"),
    tmbConfig: path.join(rootDir, "data/tmb-config.json"),
    pluginEnabledDb: path.join(rootDir, "data/plugin-enabled.json"),
    botNameDb: path.join(rootDir, "data/bot-name.json"),
    reactStickerDb: path.join(rootDir, "data/react-sticker.json"),
    antiswgcDb: path.join(rootDir, "data/antiswgc.json"),
    banDb: path.join(rootDir, "data/ban.json"),
    stickerPackDb: path.join(rootDir, "data/sticker-packs.json"),
    stickerPacksDir: path.join(rootDir, "data/sticker-packs"),

    // === hasil merge dari Karina ===
    userDb : path.join(rootDir, "data/users.json"),
    groupSettingsDb : path.join(rootDir, "data/group-settings.json"),
    lockDb : path.join(rootDir, "data/lock.json"),
    selfPublicConfig : path.join(rootDir, "data/self-public-config.json"),
    crmConfig : path.join(rootDir, "data/crm-config.json")
}

export { allPaths }