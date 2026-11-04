/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { runSetGroupEvent, buildHelpText } from "#helper/group-welcome-settings.js"

/** @type {PluginType} */
const plugin = {
    run: (ctx) => runSetGroupEvent(ctx, "demote"),
    name: "set demote notify",
    commands: ["setdemote"],
    categories: ["group"],
    description: `atur notif otomatis pas ada admin yang di turunin\n\n${buildHelpText("demote")}`
}

plugin.meta = {
    filename: "demote-notify.js",
    author: "catesya",
    note: "port dari Karina (notif promote/demote). pasangan promote-notify.js, logic shared di src/helper/group-welcome-settings.js, pengiriman notif nya di src/event-handler/group/group-participant-welcome.js (action demote di event group-participants.update, sebelumnya di-skip)",
    version: "1",
    path: "group"
}

export default plugin
