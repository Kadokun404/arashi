/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { runSetGroupEvent, buildHelpText } from "#helper/group-welcome-settings.js"

/** @type {PluginType} */
const plugin = {
    run: (ctx) => runSetGroupEvent(ctx, "promote"),
    name: "set promote notify",
    commands: ["setpromote"],
    categories: ["group"],
    description: `atur notif otomatis pas ada member yang di jadiin admin\n\n${buildHelpText("promote")}`
}

plugin.meta = {
    filename: "promote-notify.js",
    author: "catesya",
    note: "port dari Karina (notif promote/demote). pasangan demote-notify.js, logic shared di src/helper/group-welcome-settings.js, pengiriman notif nya di src/event-handler/group/group-participant-welcome.js (action promote di event group-participants.update, sebelumnya di-skip)",
    version: "1",
    path: "group"
}

export default plugin
