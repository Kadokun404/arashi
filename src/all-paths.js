import path from "node:path"

const currentDir = (p) => path.join(import.meta.dirname, p)

const allPaths = {
    root: currentDir('/'),
    // dir
    baileysAuth : currentDir('../auth'),
    plugins: currentDir('/plugins'),
    temp: currentDir('/temp'),

    // file
    prefix : currentDir('../data/prefix-config.json'),
    database : currentDir('../data/database.db'),
    trustDb : currentDir('../data/trust.json'),
    pamDb : currentDir('../data/pam.json'),
    debugConfig : currentDir('../data/debug-config.json'),
    themeConfig : currentDir('../data/theme-config.json'),
    restartFlag : currentDir('../data/restart-flag.json'),
    chatManagerConfig : currentDir('../data/chat-manager-config.json'),
    antilinkConfig : currentDir('../data/antilink-config.json'),
    groupOpenCloseConfig : currentDir('../data/group-open-close-config.json'),
    aliasConfig: currentDir('../data/alias.json'),
    tmbConfig: currentDir('../data/tmb-config.json'),
    pluginEnabledDb: currentDir('../data/plugin-enabled.json'),
    botNameDb: currentDir('../data/bot-name.json'),
    reactStickerDb: currentDir('../data/react-sticker.json'),
    antiswgcDb: currentDir('../data/antiswgc.json'),
    banDb: currentDir('../data/ban.json'),
    stickerPackDb: currentDir('../data/sticker-packs.json'),
    stickerPacksDir: currentDir('../data/sticker-packs'),

    // === hasil merge dari Karina ===
    userDb : currentDir('../data/users.json'),
    groupSettingsDb : currentDir('../data/group-settings.json'),
    lockDb : currentDir('../data/lock.json'),
    selfPublicConfig : currentDir('../data/self-public-config.json'),
    crmConfig : currentDir('../data/crm-config.json')

}

export { allPaths }