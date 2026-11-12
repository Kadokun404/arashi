import { messageSerialize } from "#serializer/messages-serializer.js"
import { prefixManager } from "#manager/prefix-manager.js"
import { resolveCommand } from "#manager/command-manager.js"
import { pluginManager } from "#manager/plugin-manager.js"
import { menuManager } from "#manager/menu-manager.js"
import { themeManager } from "#manager/theme-manager.js"
import { contactStore } from "#store/contact-store.js"
import { ownerManager } from "#manager/owner-manager.js"
import { messageStore } from "#store/make-in-memory-store.js"
import { groupMetadataStore } from "#store/group-metadata-store.js"
import { sendPluginHelp } from "#core/utils.js"

async function isGroupAdmin({ sock, m, jid }) {
    if (m?.group?.admin) return true
    if (!m?.contact?.lid) return false
    try {
        const metadata = await groupMetadataStore.getGroupMetadata(jid, sock)
        const participant = metadata?.participants?.find(p => p.id === m.contact.lid)
        return Boolean(participant?.admin)
    } catch {
        return false
    }
}

async function isBotGroupAdmin({ sock, jid }) {
    try {
        const metadata = await groupMetadataStore.getGroupMetadata(jid, sock)
        const botNumber = sock.user?.lid?.split(":")[0]
        if (!botNumber) return false
        const botParticipant = metadata?.participants?.find(p => p.id.startsWith(botNumber))
        return Boolean(botParticipant?.admin)
    } catch {
        return false
    }
}

const notifyHandler = async (bem, sock) => {
    const { messages } = bem

    for (const WAM of messages) {
        if (!WAM.message) continue

        const m = messageSerialize(WAM, sock)
        if (!m?.chat || !m?.contact) continue

        const jid = m?.key?.remoteJid
        const isGroupChat = Boolean(jid?.endsWith("@g.us"))
        const isOwnerCtx = ownerManager.isOwner(m.contact) || Boolean(m.key?.fromMe)
        const isAdminCtx = isGroupChat ? await isGroupAdmin({ sock, m, jid }) : false
        const isBotAdminCtx = isGroupChat ? await isBotGroupAdmin({ sock, jid }) : false

        let prefix, command, text, prefixOk

        if (m.button?.id) {
            const raw = (m.button.id || "").trim()
            const prefixResult = prefixManager.resolvePrefix(raw, jid)
            let commandResult = prefixResult?.ok ? resolveCommand(prefixResult) : undefined

            if (!commandResult || !pluginManager.pluginMap.has(commandResult.command)) {
                const stripped = raw.replace(/^[.!/#]/, "").trim()
                const fallbackCmd = resolveCommand({ ok: true, prefix: "", data: stripped })
                if (fallbackCmd && pluginManager.pluginMap.has(fallbackCmd.command)) {
                    commandResult = fallbackCmd
                }
            }

            if (commandResult) {
                command = commandResult.command
                text = commandResult.data || m.button.description || ""
                prefix = prefixResult?.prefix || ""
                prefixOk = true
            } else {
                command = raw
                text = m.button.description || ""
                prefix = ""
                prefixOk = true
            }
        } else {
            const prefixResult = prefixManager.resolvePrefix(m?.text, jid)
            if (!prefixResult) continue

            const commandResult = resolveCommand(prefixResult)
            if (!commandResult) continue

            prefixOk = prefixResult.ok
            if (isOwnerCtx && !prefixOk && pluginManager.pluginMap.has(commandResult.command)) {
                prefixOk = true
            }
            prefix = prefixResult.prefix || ""
            command = commandResult.command
            text = commandResult.data
        }

        const ctx = {
            sock,
            jid,
            m,
            q: m.q,
            text,
            prefix,
            command,
            isOwner: isOwnerCtx,
            isAdmin: isAdminCtx,
            isBot: isBotAdminCtx,
            pluginManager,
            menuManager,
            themeManager,
            contactStore,
            prefixManager,
            messageStore
        }

        try {
            if (ctx.isOwner && pluginManager.hasPendingConfirmation?.(m.sender)) {
                const handled = await pluginManager.processConfirmation?.(ctx)
                if (handled) continue
            }

            const plugin = pluginManager.pluginMap.get(command)
            if (!plugin) continue

            if (!prefixOk && !plugin?.config?.bypassPrefix && !ctx.isOwner) continue

            const isOwnerOnly =
                plugin?.config?.ownerOnly === true ||
                plugin?.config?.owner === true ||
                plugin?.categories?.some(cat => String(cat).toLowerCase() === "owner")
            if (isOwnerOnly && !ctx.isOwner) continue

            if (ctx.text === "-h") {
                await sendPluginHelp(ctx)
            } else {
                await plugin.run(ctx)
            }
        } catch (e) {
            console.error("[notify-handler] plugin error:", e)
            await sock.sendMessage(ctx.jid, {
                text: "*plugin error*\n" + e.message
            }, { quoted: ctx.m })
        }
    }
}

export { notifyHandler }
