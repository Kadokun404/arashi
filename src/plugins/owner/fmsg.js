/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
if (!ctx.isOwner) return 
    const { sock, m, q, jid, text } = ctx;

    // Cek reply
    if (!q) {
        return m.arashirep("reply pesan nya, dan masukan text nya");
    }

    // Cek text pengganti
    if (!text) {
        return m.arashirep("mana text ganti nya? contoh: fmsg hai");
    }

    const stanzaId = q.id || q.key?.id || q.raw?.key?.id;

    if (!stanzaId) {
        return m.arashirep("Gagal mengambil ID pesan yang direply.");
    }

    try {
       

        
        const tempId = await sock.relayMessage(
            jid,
            {
                extendedTextMessage: {
                    text: '',
                    contextInfo: {
                        isGroupStatus: true,
                    },
                },
            },
            {}
        );

        
        const tempId2 = await sock.relayMessage(
            jid,
            {
                protocolMessage: {
                    key: {
                        jid: jid,
                        fromMe: true,
                        id: tempId,
                    },
                    type: 14,
                    editedMessage: {
                        extendedTextMessage: {
                            text: text,
                            contextInfo: {
                                isGroupStatus: false,
                            },
                        },
                    },
                },
            },
            {
                messageId: stanzaId,
            }
        );
      
        await Promise.allSettled([
            sock.sendMessage(jid, {
                delete: {
                    remoteJid: jid,
                    id: tempId,
                    fromMe: true,
                },
            }),
            sock.sendMessage(jid, {
                delete: {
                    remoteJid: jid,
                    id: tempId2,
                    fromMe: true,
                },
            }),
        ]);

   
    } catch (e) {
        console.error('[fmsg error]', e);
        await m.react("❌");
        await m.arashirep('❌ Error: ' + (e?.message || e));
    }
}

/** @type {PluginType} */
const plugin = {
    run,
    name: "fake message edit",
    commands: ["fmsg", "fakemsg"],
    categories: ["owner"],
    description: "idk"
};

plugin.meta = {
    filename: "fmsg.js",
    version: "1.0",
    author: "Nixel | Ported by Mina",
    note: "Bug edit other's message",
    path: "owner"
};

export default plugin;