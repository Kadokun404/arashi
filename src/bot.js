import fs from "node:fs"

const _realUptime = process.uptime.bind(process)
const _botStartTime = (() => {
    const envTime = Number(process.env.BOT_START_TIME)
    if (Number.isFinite(envTime) && envTime > 0) return envTime
    return Date.now() - Math.floor(_realUptime() * 1000)
})()

process.realUptime = _realUptime
process.uptime = () => Math.max(0, (Date.now() - _botStartTime) / 1000)

process.on("unhandledRejection", (reason, promise) => {
    console.error("[bot.js] Unhandled Rejection at:", promise, "reason:", reason)
})
process.on("uncaughtException", (err, origin) => {
    console.error(`[bot.js] Uncaught Exception (${origin}):`, err)
})

if (!fs.existsSync("./auth")) {
    fs.mkdirSync("./auth", { recursive: true })
}

import { bootstrapData } from "./core/bootstrap-data.js"
await bootstrapData()

import { createSocket } from "./core/socket.js"
import { handlerCredsUpdate } from "./event-handler/creds/creds-update.js"
import { handlerConnectionUpdate } from "./event-handler/connection/connection-update.js"
import { handlertMessagesUpsert } from "./event-handler/messages/messages-upsert.js"
import { handlerMessagingHistorySet } from "./event-handler/messages/messaging-history-set.js"

import { chatStore } from "./store/chat-store.js"
import { contactStore } from "./store/contact-store.js"
import { db } from "./database/database.js"
import { groupMetadataStore } from "./store/group-metadata-store.js"
import { memberLabelStore } from "./store/member-label-store.js"
import { prefixManager } from "./manager/prefix-manager.js"
import { pluginManager } from "./manager/plugin-manager.js"
import { menuManager } from "./manager/menu-manager.js"
import { store } from "./store/store.js"
import { messageStore } from "./store/make-in-memory-store.js"

global._ = {
    prefixManager,
    pluginManager,
    menuManager,
    store,
    messageStore,
    contactStore,
    chatStore,
    db,
    groupMetadataStore,
    memberLabelStore
}

const startSock = async () => {
    const sock = await createSocket()

    sock.ev.process(async (ev) => {
        try {
            store.bind(ev, sock)
        } catch (e) {
            console.error("[bot.js] store.bind gagal:", e)
        }

        try {
            messageStore.bind(ev)
        } catch (e) {
            console.error("[bot.js] messageStore.bind gagal:", e)
        }

        if (ev["creds.update"]) {
            try {
                await handlerCredsUpdate(ev["creds.update"], sock)
            } catch (e) {
                console.error("[bot.js/creds.update] Error:", e)
            }
        }

        if (ev["connection.update"]) {
            try {
                await handlerConnectionUpdate(ev["connection.update"], sock, startSock)
            } catch (e) {
                console.error("[bot.js/connection.update] Error:", e)
            }
        }

        if (ev["messages.upsert"]) {
            try {
                await handlertMessagesUpsert(ev["messages.upsert"], sock)
            } catch (e) {
                console.error("[bot.js/messages.upsert] Error:", e)
            }
        }

        if (ev["messaging-history.set"]) {
            try {
                await handlerMessagingHistorySet(ev["messaging-history.set"], sock)
            } catch (e) {
                console.error("[bot.js/messaging-history.set] Error:", e)
            }
        }
    })

    global._.sock = sock
}

await startSock()
