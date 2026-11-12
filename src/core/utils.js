import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"

export const longNormalizer = (param) => {
    if (typeof param?.toInt === "function") return param.toInt()
    if (typeof param === "number") return param
    return undefined
}

export const toJsObject = (input) => ({ ...input })

export async function writeAtomic(targetPath, data, options = "utf-8") {
    const dir = path.dirname(targetPath)
    await fs.mkdir(dir, { recursive: true })
    const tmpPath = `${targetPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`
    try {
        await fs.writeFile(tmpPath, data, options)
        await fs.rename(tmpPath, targetPath)
    } catch (err) {
        await fs.unlink(tmpPath).catch(() => {})
        throw err
    }
}

export async function writeJsonAtomic(targetPath, data, space = 2) {
    const jsonStr = JSON.stringify(data, null, space)
    await writeAtomic(targetPath, jsonStr, "utf-8")
}

export const sendPluginHelp = async (ctx) => {
    const { pluginManager, command, m } = ctx
    const plugin = pluginManager.getPlugin(command)
    if (!plugin) return
    const { name, categories = [], description = "-", commands = [], meta = {} } = plugin
    const text =
        `*${name}*\n\n` +
        `• *Command:* ${commands.join(", ")}\n` +
        `• *Category:* ${categories.join(", ")}\n` +
        `• *Description:* ${description}\n` +
        `• *Author:* ${meta.author || "-"}\n` +
        `• *Version:* ${meta.version || "1.0"}`
    return await m.arashirep(text)
}
