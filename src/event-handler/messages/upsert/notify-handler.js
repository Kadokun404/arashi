import { messageSerialize } from "#serializer/messages-serializer.js"
import { memberLabelSerialize } from "#serializer/member-label-serialize.js"
import { memberLabelStore } from "#store/member-label-store.js"
import { proto } from "baileys"
import { prefixManager } from "#manager/prefix-manager.js"
import { resolveCommand } from "#manager/command-manager.js"
import { pluginManager } from "#manager/plugin-manager.js"
import { menuManager } from "#manager/menu-manager.js"
import { themeManager } from "#manager/theme-manager.js"
import { sendPluginHelp } from "#helper/send-plugin-help.js"
import { contactStore } from "#store/contact-store.js"
import { ownerManager } from "#manager/owner-manager.js"
import { pamManager } from "#manager/pam-manager.js"
import { chatManager } from "#manager/chat-manager.js"
import { messageStore } from "#store/make-in-memory-store.js"
import { antilinkManager } from "#manager/antilink-manager.js"
import { pluginEnableManager } from "#manager/plugin-enable-manager.js"
import { isGroupAdmin, isBotGroupAdmin } from "#helper/group-admin.js"
import { config } from "#root/config.js"
import { botNameManager } from "#manager/bot-name-manager.js"
import { antiTagSwManager } from "#manager/antitagsw-manager.js"
import { antiSwGcManager } from "#manager/antiswgc-manager.js"
import { banManager } from "#manager/ban-manager.js"
import { heavyQueueManager } from "#manager/heavy-queue-manager.js"
import { araManager } from "#manager/ara-manager.js"
import { askAra } from "#root/src/plugins/ai/ara.js"
import { handleGameAnswer } from "#manager/game-manager.js"
export { handlerGroupParticipantsUpdate } from "../../group/group-participant-welcome.js"

const ProtocolMessageType = proto.Message.ProtocolMessage.Type


/**
 * messages upsert handler
 * @param {import ("baileys").WASocket} sock 
 * @param {import ("baileys").BaileysEventMap['messages.upsert']} bem 
 */


const notifyHandler = async (bem, sock) => {
    const { messages } = bem

    const activeBotName = sock.user?.name || config.botName
    const isNameLocked = Boolean(activeBotName) && botNameManager.exists(activeBotName) && botNameManager.isLocked(activeBotName)

    for (const WAM of messages) {
      
        if (!WAM.message) {
            console.warn(`[notify no message]`, WAM)
            continue
        }

        const m = messageSerialize(WAM, sock)

        if (!m?.chat) {
            console.warn(`[notify no chat]`, WAM)
            continue
        }

        if (!m?.contact) {
            console.warn(`[notify no contact]`, WAM)
            continue
        }

        const jid = m?.key?.remoteJid
        const isGroupChat = chatManager.isGroupJid(jid)

        const isOwnerCtx = ownerManager.isOwner(m.contact)
        const isKadokunCtx = ownerManager.isBaseOwner(m.contact?.pn)
        const isAdminCtx = isGroupChat ? await isGroupAdmin({ sock, m, jid }) : false
        const isBotAdminCtx = isGroupChat ? await isBotGroupAdmin({ sock, jid }) : false

        if (!m.key?.fromMe && !isOwnerCtx && banManager.isBanned(m.contact)) {
            continue
        }


        if (isGroupChat && !m.key?.fromMe) {
            const isExempt = isOwnerCtx || isAdminCtx
            if (!isExempt) {
                const { violated } = antilinkManager.check(jid, m.text)
                if (violated) {
                    try {
                        await sock.sendMessage(jid, { delete: m.key })
                    } catch (e) {
                        console.error(`[antilink] gagal hapus pesan`, e)
                    }

                    await sock.sendMessage(jid, {
                        text: `Pesan mengandung link terlarang dan telah dihapus.\nPengirim: @${m.contact.lid.split('@')[0]}`,
                        mentions: [m.contact.lid]
                    }, { quoted: m })
                    continue
                }
            }
        }

        if (isGroupChat && !m.key?.fromMe && antiTagSwManager.isEnabled(jid)) {
            const isTagSw = m.message?.groupStatusMentionMessage || m.content === 'groupStatusMentionMessage'
            const isExempt = isOwnerCtx || isAdminCtx

            if (isTagSw && isBotAdminCtx && !isExempt) {
                try {
                    await sock.sendMessage(jid, { delete: m.key })
                } catch (e) {
                    console.error(`[antitagsw] gagal hapus pesan`, e)
                }

                await sock.sendMessage(jid, {
                    text: `Tag status/SW grup tanpa izin admin terdeteksi dan pesan telah dihapus.\nPengirim: @${m.contact.lid.split('@')[0]}`,
                    mentions: [m.contact.lid]
                }, { quoted: m })

                continue
            }
        }

        if (isGroupChat && !m.key?.fromMe && antiSwGcManager.isEnabled(jid)) {
            const isSwGc = m.content === 'groupStatusMessageV2' || !!m.message?.groupStatusMessageV2
            const isExempt = isOwnerCtx || isAdminCtx

            if (isSwGc && !isExempt) {
                if (isBotAdminCtx) {
                    try {
                        await sock.sendMessage(jid, { delete: m.key })
                        if (m.key?.participantAlt) {
                            await sock.sendMessage(jid, {
                                delete: {
                                    remoteJid: m.key.remoteJid,
                                    fromMe: false,
                                    id: m.key.id,
                                    participant: m.key.participantAlt
                                }
                            }).catch(() => {})
                        }
                    } catch (e) {
                        console.error(`[antiswgc] failed to delete message`, e)
                    }

                    const shouldKick = antiSwGcManager.isKick(jid)
                    const targetParticipant = m.contact?.lid || m.sender || m.key?.participant
                    if (shouldKick && targetParticipant) {
                        try {
                            await sock.groupParticipantsUpdate(jid, [targetParticipant], "remove")
                        } catch (e) {
                            console.error(`[antiswgc] failed to kick participant`, e)
                        }
                    }

                    const senderMention = m.contact?.lid || m.contact?.pn || m.sender
                    const senderNum = senderMention ? senderMention.split("@")[0] : "member"
                    const mentions = [m.contact?.lid, m.contact?.pn, m.sender].filter(Boolean)

                    const noticeText = shouldKick
                        ? `status/story in group is not allowed.\nsender @${senderNum} has been removed from the group.`
                        : `status/story in group detected and deleted.\nsender: @${senderNum}`

                    await sock.sendMessage(jid, {
                        text: noticeText,
                        mentions
                    })
                }
                continue
            }
        }

        let prefix, command, text, prefixOk

        if (m.button?.id) {
            const raw = (m.button.id || '').trim()
            const prefixResult = prefixManager.resolvePrefix(raw)
            let commandResult = prefixResult?.ok ? resolveCommand(prefixResult) : undefined

            if (commandResult && !pluginManager.pluginMap.has(commandResult.command)) {
                const stripped = commandResult.command.replace(/^[.!/#]/, '')
                if (pluginManager.pluginMap.has(stripped)) {
                    commandResult.command = stripped
                }
            }

            if (!commandResult || !pluginManager.pluginMap.has(commandResult.command)) {
                const stripped = raw.replace(/^[.!/#]/, '').trim()
                const fallbackCmd = resolveCommand({ ok: true, prefix: '', data: stripped })
                if (fallbackCmd && pluginManager.pluginMap.has(fallbackCmd.command)) {
                    commandResult = fallbackCmd
                }
            }

            if (commandResult) {
                command = commandResult.command
                text = commandResult.data || m.button.description || ''
                prefix = prefixResult?.prefix || ''
                prefixOk = true
            } else {
                command = raw
                text = m.button.description || ''
                prefix = ''
                prefixOk = true
            }
        } else {
            const prefixResult = prefixManager.resolvePrefix(m?.text)
            if (!prefixResult) continue

            const commandResult = resolveCommand(prefixResult)
            if (!commandResult) {
                if (isOwnerCtx && !m.key?.fromMe && m.q?.key?.fromMe) {
                    prefixOk = false
                    prefix = ''
                    command = ''
                    text = ''
                } else {
                    continue
                }
            } else {
                prefixOk = prefixResult.ok
                prefix = prefixResult.prefix
                command = commandResult.command
                text = commandResult.data
            }
        }

        const result = {
            prefix,
            command,
            text,
            prefixOk
        }

        console.log(result)
        const isPamAllowed = pamManager.hasAccess(m.contact, command, jid)
        const ctx = {
            sock,
            jid,
            m,
            q: m.q,
            text,
            prefix,
            command,
            isOwner: isOwnerCtx || isPamAllowed,
            isPamAllowed,
            isAdmin: isAdminCtx,
            isBot: isBotAdminCtx,
            Kadokun: isKadokunCtx,
            pluginManager,
            menuManager,
            themeManager,
            contactStore,
            prefixManager,
            messageStore,
            pluginEnableManager
        }
        const isOwner = ctx.isOwner
        const isChatAllowed = chatManager.isAllowed(ctx.jid, isOwner)

        if (!isChatAllowed && !isPamAllowed) {
            console.log('skip', m)
            continue
        }

        const plugin = pluginManager.pluginMap.get(command)
        const araPlugin = pluginManager.pluginMap.get("ara")
        const isReplyToBot = Boolean(!m.key?.fromMe && m.q?.key?.fromMe)
        const isReplyToAra = Boolean(isReplyToBot && araPlugin?.isAraMessage?.(m.q?.key?.id))
        const ownerBypassCmds = new Set(["ara", "arashi", "agy", "ra", "ai", "r", "reload", "refresh", "d", "del", "delete", "$", ">", "=>"])

        console.log(m)

        try {
            if (!m.key?.fromMe && (!plugin || !result?.prefixOk) && (await handleGameAnswer({ sock, m, jid }))) {
                continue
            }
            if (isOwner && isReplyToAra && !ownerBypassCmds.has(command) && araPlugin?.handleReply) {
                await araPlugin.handleReply(ctx)
            } else if (plugin) {
                if (!result?.prefixOk && !plugin?.config?.bypassPrefix) continue

if ((global.isBotLocked || isNameLocked) && !plugin?.config?.bypassLock) continue

                if (!chatManager.isAllowed(ctx.jid, isOwner) && !isPamAllowed && ctx.command !== "chat") continue

                
                if (!isOwner && !pluginEnableManager.isEnabled(ctx.command)) {
                    await sock.sendMessage(ctx.jid, {
                        text: `fitur ${ctx.command} lagi di nonaktifkan oleh owner.`
                    }, { quoted: ctx.m })
                    continue
                }

                if (ctx.text === "-h") {
                    await sendPluginHelp(ctx)
                } else {
                    let taskId = null
                    const isHeavy = heavyQueueManager.isHeavy(plugin, ctx.command)
                    if (isHeavy) {
                        const queueCheck = heavyQueueManager.canExecute(m.sender, isOwner)
                        if (!queueCheck.allowed) {
                            if (queueCheck.reason === "cooldown") {
                                await sock.sendMessage(ctx.jid, {
                                    text: `⏳ Mohon tunggu *${queueCheck.remaining} detik* lagi sebelum menggunakan perintah media berikutnya.`
                                }, { quoted: ctx.m })
                                continue
                            } else if (queueCheck.reason === "queue_full") {
                                await sock.sendMessage(ctx.jid, {
                                    text: `⏳ Antrean proses media sedang penuh (${queueCheck.active}/${queueCheck.max}). Mohon tunggu beberapa saat ya...`
                                }, { quoted: ctx.m })
                                continue
                            }
                        }
                        taskId = heavyQueueManager.acquire(m.sender, ctx.command)
                    }

                    try {
                        await plugin.run(ctx)
                    } finally {
                        if (taskId) {
                            heavyQueueManager.release(taskId, m.sender)
                        }
                    }
                }
            } else if (isOwner && isReplyToBot && araPlugin?.handleReply) {
                await araPlugin.handleReply(ctx)
            } else if (!m.key?.fromMe && araManager.isActive(jid, m.sender)) {
                const quotedFromOther = m.q && !m.q.key?.fromMe
                if (!quotedFromOther) await askAra(ctx, m.text)
           }
        } catch (e) {
            console.error(`plugin error`, e)
            await sock.sendMessage(ctx.jid, {
                text: '*duar plugin error*\n' + e.message
            }, { quoted: ctx.m })
        }


    }
}

export { notifyHandler }