/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { runSetGroupEvent, buildHelpText } from "#helper/group-welcome-settings.js"

/** @type {PluginType} */
const plugin = {
    run: (ctx) => runSetGroupEvent(ctx, "welcome"),
    name: "welcome",
    commands: ["welcome", "setwelcome"],
    categories: ["group"],
    description: `configure welcome message for this group\n\n${buildHelpText("welcome")}`
}

plugin.meta = {
    filename: "welcome.js",
    author: "catesya",
    note: "group welcome manager",
    version: "2",
    path: "group"
}

export default plugin
