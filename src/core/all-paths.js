import path from "node:path"

const srcDir = path.resolve(import.meta.dirname, "..")
const rootDir = path.resolve(srcDir, "..")

const allPaths = {
    root: path.join(srcDir, "/"),
    baileysAuth: path.join(rootDir, "auth"),
    plugins: path.join(srcDir, "plugins"),
    temp: path.join(srcDir, "temp"),
    trashDir: path.join(rootDir, "data/trash/plugins"),
    trashMeta: path.join(rootDir, "data/trash/plugin-trash.json"),
    prefix: path.join(rootDir, "data/prefix-config.json"),
    groupPrefix: path.join(rootDir, "data/group-prefix.json"),
    database: path.join(rootDir, "data/database.db"),
    trustDb: path.join(rootDir, "data/trust.json"),
    themeConfig: path.join(rootDir, "data/theme-config.json"),
    restartFlag: path.join(rootDir, "data/restart-flag.json")
}

export { allPaths }
