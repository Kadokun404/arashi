import fs from "node:fs";

const _realUptime = process.uptime.bind(process);
const _botStartTime = (() => {
    const envTime = Number(process.env.BOT_START_TIME);
    if (Number.isFinite(envTime) && envTime > 0) return envTime;
    try {
        if (fs.existsSync("./data/uptime.json")) {
            const parsed = JSON.parse(fs.readFileSync("./data/uptime.json", "utf-8"));
            if (Number.isFinite(parsed?.startTime) && parsed.startTime > 0) return parsed.startTime;
        }
    } catch { }
    return Date.now() - Math.floor(_realUptime() * 1000);
})();

process.realUptime = _realUptime;
process.uptime = () => Math.max(0, (Date.now() - _botStartTime) / 1000);

// Global Error Boundary untuk mencegah crash mendadak akibat unhandled promise / exception
process.on("unhandledRejection", (reason, promise) => {
    console.error("[bot.js/process] Unhandled Rejection detected at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err, origin) => {
    console.error(`[bot.js/process] Uncaught Exception (${origin}):`, err);
});

// auto mkdir folder auth biar ga eror kalau folder auth belum ada
// (mkdir nya dieksekusi di auth.js juga karena auth.js jalan duluan sebelum baris di bawah ini,
// tapi kita jaga-jaga lagi di sini)
if (!fs.existsSync("./auth")) {
    fs.mkdirSync("./auth", { recursive: true });
}

import { bootstrapData } from "./core/bootstrap-data.js";
await bootstrapData();

import { createSocket } from "./core/socket.js";
import { customAuth } from "./core/auth.js";

// event handler
import { handlerCredsUpdate } from "./event-handler/creds/creds-update.js";
import { handlerConnectionUpdate } from "./event-handler/connection/connection-update.js";
import { handlertMessagesUpsert } from "./event-handler/messages/messages-upsert.js";
import { handlerMessagingHistorySet } from "./event-handler/messages/messaging-history-set.js";
import { handlerGroupParticipantsUpdate } from "./event-handler/group/group-participant-welcome.js";

// global debug
import { chatStore } from "./store/chat-store.js";
import { contactStore } from "./store/contact-store.js"
import { emit } from "../scripts/emit-test/emit-trigger.js";
import { db } from "./database/database.js";
import { groupMetadataStore } from "./store/group-metadata-store.js";
import { memberLabelStore } from "./store/member-label-store.js";

// manager
import { prefixManager } from "./manager/prefix-manager.js";
import { pluginManager } from "./manager/plugin-manager.js";
import { pluginPermissionManager } from "./manager/plugin-permission-manager.js";
import { menuManager } from "./manager/menu-manager.js";
import { aliasManager } from "./manager/alias-manager.js";
import { housekeepingManager } from "#manager/system/housekeeping-manager.js";
housekeepingManager.startScheduler(30);

// global store
import { store } from "./store/store.js";
import { messageStore } from "./store/make-in-memory-store.js";
import { pendingGroupJoinManager } from "#manager/group/pending-group-join-manager.js";
import { ttdl } from "#helper/services/tiktok.js";
import crmstore from "#store/crmstore.js";
import { config } from "../config.js";
// for testing
global._ = {
    prefixManager,
    pluginManager,
    pluginPermissionManager,
    menuManager,


    store,
    messageStore,
    contactStore,
    chatStore,
    emit,
    db,
    groupMetadataStore,
    memberLabelStore
}

global.ttdl = ttdl


const startSock = async () => {

    const sock = await createSocket()

    try {
        crmstore.bind(sock)
    } catch (e) {
        console.error(`[bot.js] crmstore.bind gagal:`, e)
    }

    sock.ev.process(async (ev) => {
    const { ["presence.update"]: tmp1, ["message-receipt.update"]: tmp2, ...rest } = ev
    if (Object.keys(rest).length) {
        console.log(rest)
    }

    try {
        store.bind(ev, sock)
    } catch (e) {
        console.error(`[bot.js] store.bind gagal:`, e)
    }

    try {
        messageStore.bind(ev)
    } catch (e) {
        console.error(`[bot.js] messageStore.bind gagal:`, e)
    }

    try {
        pendingGroupJoinManager.bind(ev, sock)
    } catch (e) {
        console.error(`[bot.js] pendingGroupJoinManager.bind gagal:`, e)
    }

    if (ev['creds.update']) {
        try {
            await handlerCredsUpdate(ev['creds.update'], sock)
        } catch (e) {
            console.error("[bot.js/creds.update] Error:", e)
        }
    }

    if (ev['connection.update']) {
        try {
            await handlerConnectionUpdate(ev['connection.update'], sock, startSock)
        } catch (e) {
            console.error("[bot.js/connection.update] Error:", e)
        }
    }

    if (ev['messages.upsert']) {
        try {
            await handlertMessagesUpsert(ev['messages.upsert'], sock)
        } catch (e) {
            console.error("[bot.js/messages.upsert] Error:", e)
        }
    }

    if (ev['messaging-history.set']) {
        try {
            await handlerMessagingHistorySet(ev['messaging-history.set'], sock)
        } catch (e) {
            console.error("[bot.js/messaging-history.set] Error:", e)
        }
    }

    if (ev['group-participants.update']) {
        try {
            await handlerGroupParticipantsUpdate(ev['group-participants.update'], sock)
        } catch (e) {
            console.error("[bot.js/group-participants.update] Error:", e)
        }
    }
})

    global._.sock = sock
aliasManager.reapplyAll(sock)
}

await startSock()