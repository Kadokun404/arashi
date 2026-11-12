import fs from "node:fs/promises"
import path from "node:path"
import { allPaths } from "./all-paths.js"

const DEFAULT_CONTENT = {
    prefix: { isPrefixActive: false, prefixList: [".", "#", "/"] },
    groupPrefix: {},
    trustDb: [],
    themeConfig: {}
}

const bootstrapData = async () => {
    await fs.mkdir(path.join(allPaths.root, "../data"), { recursive: true }).catch(() => {})
    for (const [key, filePath] of Object.entries(allPaths)) {
        if (!filePath || typeof filePath !== "string" || !filePath.endsWith(".json")) continue
        if (!(key in DEFAULT_CONTENT)) continue
        try {
            await fs.access(filePath)
        } catch {
            await fs.mkdir(path.dirname(filePath), { recursive: true })
            await fs.writeFile(filePath, JSON.stringify(DEFAULT_CONTENT[key], null, 2))
        }
    }
}

export { bootstrapData }
