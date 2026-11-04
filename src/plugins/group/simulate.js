/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { groupWelcomeManager } from "#manager/group-welcome-manager.js"
import { groupMetadataStore } from "#store/group-metadata-store.js"
import { contactStore } from "#store/contact-store.js"
import { generateWelcomeCard, generateGoodbyeCard } from "#helper/canvas/welcomecard.js"
import { chatManager } from "#manager/chat-manager.js"
import { ownerManager } from "#manager/owner-manager.js"
import { config } from "#root/config.js"

const HELP_TEXT = `simulate - test group events\n\n` +
    `usage:\n` +
    `• simulate add [@user]\n` +
    `• simulate leave [@user]\n` +
    `• simulate promote [@user]\n` +
    `• simulate demote [@user]\n` +
    `• simulate sw [@user]\n\n` +
    `aliases:\n` +
    `• add, welcome, join\n` +
    `• leave, goodbye, kick, remove\n` +
    `• sw, antisw, antiswgc`

async function downloadUrl(url) {
    if (!url) return undefined
    try {
        const res = await fetch(url)
        if (!res.ok) return undefined
        return Buffer.from(await res.arrayBuffer())
    } catch {
        return undefined
    }
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, q, jid, text } = ctx

    if (!chatManager.isGroupJid(jid)) {
        return await m.reply("simulate command can only be used in group chats.")
    }

    const isAllowed = ownerManager.isOwner(m.contact) || !!m.group?.admin
    if (!isAllowed) {
        return await m.reply("only group admins or bot owner can run simulations.")
    }

    const args = (text || "").trim().split(/\s+/).filter(Boolean)
    const event = args[0]?.toLowerCase()

    if (!event || event === "-h" || event === "help") {
        return await m.reply(HELP_TEXT)
    }

    // Resolve target participant
    const mentionedJid = m?.message?.[m?.content]?.contextInfo?.mentionedJid?.[0]
    const targetJid = mentionedJid || q?.sender || m.sender || m.contact?.lid || m.contact?.pn

    const contact = contactStore.resolve?.(targetJid) ||
                    contactStore.getByLid?.(targetJid) ||
                    contactStore.getByPn?.(targetJid)
    const name = contact?.name || targetJid.split("@")[0]

    let groupName = "group"
    let memberCount = 1
    try {
        const metadata = await groupMetadataStore.getGroupMetadata(jid, sock)
        groupName = metadata?.subject || groupName
        memberCount = metadata?.participants?.length ?? memberCount
    } catch {}

    const placeholderData = { name, group: groupName, count: memberCount, lid: targetJid }

    // Fetch avatar
    let avatarBuffer
    try {
        const ppUrl = await sock.profilePictureUrl(targetJid, "image")
        avatarBuffer = await downloadUrl(ppUrl)
    } catch {}

    // ADD / WELCOME / JOIN
    if (["add", "welcome", "join"].includes(event)) {
        const settings = groupWelcomeManager.getWelcomeSettings(jid)
        const backgroundBuffer = await downloadUrl(settings?.background)
        const cardData = { name, groupName, memberCount, avatarBuffer, backgroundBuffer }

        const caption = groupWelcomeManager.buildWelcomeText(jid, placeholderData) ||
            `welcome @${targetJid.split("@")[0]} to ${groupName}. you are member #${memberCount}.`

        const image = await generateWelcomeCard(cardData)
        const sent = await sock.sendMessage(jid, { image, caption, mentions: [targetJid] }, { quoted: m })

        const autoDeleteSeconds = groupWelcomeManager.getWelcomeAutoDeleteSeconds(jid)
        if (sent?.key && autoDeleteSeconds > 0) {
            setTimeout(() => {
                sock.sendMessage(jid, { delete: sent.key }).catch(() => {})
            }, autoDeleteSeconds * 1000)
        }
        return
    }

    // LEAVE / GOODBYE / KICK / REMOVE
    if (["leave", "goodbye", "kick", "remove"].includes(event)) {
        const settings = groupWelcomeManager.getGoodbyeSettings(jid)
        const backgroundBuffer = await downloadUrl(settings?.background)
        const cardData = { name, groupName, memberCount, avatarBuffer, backgroundBuffer }

        const caption = groupWelcomeManager.buildGoodbyeText(jid, placeholderData) ||
            `goodbye @${targetJid.split("@")[0]}.`

        const image = await generateGoodbyeCard(cardData)
        return await sock.sendMessage(jid, { image, caption, mentions: [targetJid] }, { quoted: m })
    }

    // PROMOTE
    if (event === "promote") {
        const caption = groupWelcomeManager.buildPromoteText(jid, placeholderData) ||
            `congratulations @${targetJid.split("@")[0]}, you are now an admin in ${groupName}.`
        return await sock.sendMessage(jid, { text: caption, mentions: [targetJid] }, { quoted: m })
    }

    // DEMOTE
    if (event === "demote") {
        const caption = groupWelcomeManager.buildDemoteText(jid, placeholderData) ||
            `@${targetJid.split("@")[0]} is no longer an admin in ${groupName}.`
        return await sock.sendMessage(jid, { text: caption, mentions: [targetJid] }, { quoted: m })
    }

    // SW / ANTISWGC
    if (["sw", "antisw", "antiswgc"].includes(event)) {
        const senderNum = targetJid.split("@")[0]
        return await sock.sendMessage(jid, {
            text: `status/story in group detected and deleted.\nsender: @${senderNum}`,
            mentions: [targetJid]
        })
    }

    return await m.reply(`unknown event '${event}'.\n\n${HELP_TEXT}`)
}

/** @type {PluginType} */
const plugin = { run }

plugin.name = "simulate"
plugin.commands = ["simulate", "sim"]
plugin.categories = ["group"]
plugin.description = "simulate group events (welcome, goodbye, promote, demote)"

plugin.meta = {
    filename: "simulate.js",
    author: config.devName,
    note: "simulate group events for testing welcome/goodbye cards",
    version: "1",
    path: "group"
}

export default plugin
