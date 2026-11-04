/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */
import playPlugin from "./play.js"

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    return await playPlugin.run({ ...ctx, command: "yp" })
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "youtube mp3 downloader",
    commands: ["ytmp3", "ytaudio"],
    categories: ["downloader"],
    description: "download audio/mp3 dari youtube via link atau judul (alias ke yp)"
}

plugin.meta = {
    filename: "ytmp3.js",
    version: "2",
    author: "Kado",
    note: "terhubung ke play.js (yp)",
    path: "downloader"
}

export default plugin
