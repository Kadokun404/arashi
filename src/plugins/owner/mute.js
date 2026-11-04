/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { jidDecode } from "baileys"

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fungsi bug dmsg
async function executeDeleteBug(sock, chatId, stanzaId) {
    try {
        const tempId = await sock.relayMessage(
            chatId,
            { groupStatusMessageV2: { message: { extendedTextMessage: { text: '', contextInfo: { isGroupStatus: true } } } } },
            {}
        );

        const tempId2 = await sock.relayMessage(
            chatId,
            {
                protocolMessage: {
                    key: { jid: chatId, fromMe: true, id: tempId },
                    type: 14,
                    editedMessage: { extendedTextMessage: { text: '\0', contextInfo: { isGroupStatus: false } } }
                }
            },
            { messageId: stanzaId }
        );

        await delay(100);

        await Promise.allSettled([
            sock.sendMessage(chatId, { delete: { remoteJid: chatId, id: tempId, fromMe: true } }),
            sock.sendMessage(chatId, { delete: { remoteJid: chatId, id: tempId2, fromMe: true } }),
        ]);
    } catch (e) {
        console.error('[Bug Dmsg Error]', e);
    }
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, q, command, isOwner } = ctx;

    // Pengecekan Owner
    if (!isOwner) return
    // Mencari target
    const mentionedJid = m?.message?.[m?.content]?.contextInfo?.mentionedJid || [];
    let target = q?.sender || (q?.contact?.pn ? jidDecode(q.contact.pn)?.user + "@s.whatsapp.net" : null) || mentionedJid[0];

    if (!target) {
        return await m.arashirep("mana target nya sayang?, kamu bisa reply atau tag target");
    }

    // Inisialisasi state global
    global.db_bungkamuser = global.db_bungkamuser || {};
    
    const isUnmute = command.startsWith('un');
    const targetName = `target.contact.name`;

    if (isUnmute) {
        global.db_bungkamuser[target] = false;
        await m.arashirep(`wkwk, sayangku masi ada hati buat kamu, next time hati hati ya`, { mentions: [target] });
    } else {
        global.db_bungkamuser[target] = true;
        await m.arashirep(`wop, maaff, suamiku kesel sama kamuu`, { mentions: [target] });
    }

    // Memasang Listener Global
    if (!global.hasBungkamUserListener) {
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            
            for (const msg of messages) {
                const chatId = msg.key.remoteJid;
                const sender = msg.key.participant || msg.key.remoteJid; 
                
             
                if (global.db_bungkamuser[sender] && !msg.key.fromMe) {
                    const stanzaId = msg.key.id;
                    await executeDeleteBug(sock, chatId, stanzaId);
                }
            }
        });
        global.hasBungkamUserListener = true;
    }
}

/** @type {PluginType} */
const plugin = {
    run,
    name: "bungkam user",
    commands: ["bungkam", "unbungkam", "mute", "unmute"],
    categories: ["owner"],
    description: "Bungkam/Unbungkam spesifik user. Semua chat target otomatis dihapus",
};

plugin.meta = {
    filename: "mute.js",
    version: "1.1",
    author: "Kadokun",
    note: "Auto delete specific user's messages + Explicit unmute command",
    path: "owner"
};

export default plugin;