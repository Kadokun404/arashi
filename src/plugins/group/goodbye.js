/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { runSetGroupEvent, buildHelpText } from "#helper/group-welcome-settings.js"

/** @type {PluginType} */
const plugin = {
    run: (ctx) => runSetGroupEvent(ctx, "goodbye"),
    name: "goodbye",
    commands: ["goodbye", "setgoodbye"],
    categories: ["group"],
    description: `configure goodbye message for this group\n\n${buildHelpText("goodbye")}`
}

plugin.meta = {
    filename: "goodbye.js",
    author: "catesya",
    note: "group goodbye manager",
    version: "2",
    path: "group"
}

export default plugin
