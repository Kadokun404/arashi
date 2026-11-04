/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */
import playPlugin from "./play.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    return await playPlugin.run({ ...ctx, command: "ypv" })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "youtube video downloader",
    commands: ["ytv", "ytvideo"],
    categories: ["downloader"],
    description: "download video youtube dari link atau judul (alias ke ypv)"
}

plugin.meta = {
    filename: "ytv.js",
    version: "2",
    author: "Kado",
    note: "terhubung ke play.js (ypv)",
    path: "downloader"
}

export default plugin
