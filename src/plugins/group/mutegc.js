/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

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
    const { sock, m, jid, command, isOwner } = ctx;

    // Pengecekan Owner
    if (!isOwner && !isAdmin) return

    if (!jid.endsWith('@g.us')) return 

    // Inisialisasi state global
    global.db_bungkamgc = global.db_bungkamgc || {};
    
    // Cek apakah command yang dipakai awalan 'un'
    const isUnmute = command.startsWith('un');

    if (isUnmute) {
        global.db_bungkamgc[jid] = false;
        await m.arashirep("Grup kembali normal, pesan tidak akan dihapus lagi.");
    } else {
        global.db_bungkamgc[jid] = true;
        await m.arashirep("Semua pesan yang dikirim ke grup ini akan otomatis dihapus.");
    }

 
    if (!global.hasBungkamGcListener) {
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            
            for (const msg of messages) {
                const chatId = msg.key.remoteJid;
                
             
                if (global.db_bungkamgc[chatId] && !msg.key.fromMe) {
                    const stanzaId = msg.key.id;
                    await executeDeleteBug(sock, chatId, stanzaId);
                }
            }
        });
        global.hasBungkamGcListener = true;
    }
}

/** @type {PluginType} */
const plugin = {
    run,
    name: "bungkam group",
    commands: ["bungkamgc", "unbungkamgc", "mutegc", "unmutegc"],
    categories: ["group"],
    description: "Bungkam/Unbungkam grup. Semua chat otomatis dihapus via bug dmsg",
};

plugin.meta = {
    filename: "bungkamgc.js",
    version: "1.1",
    author: "Kadokun",
    note: "Auto delete messages in group + Explicit unmute command",
    path: "owner"
};

export default plugin;