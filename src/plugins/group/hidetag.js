import { isJidGroup } from "baileys"
import { config } from "#root/config.js"

const INVISIBLE = "\u200B"

const HELP = `*ht/h* — hidetag + relay

*ht <text>* — tag all
*ht -a <text>* — tag admins
*ht -i <text>* — invisible tag

*ht* (reply, no text) — relay message + tag all

admin/owner only`

function isAdmin(ctx) {
    if (ctx.isOwner) return true

    const a = ctx.m?.group?.admin

    return a === "admin" || a === "superadmin"
}

/**
 * Ambil semua participant grup.
 */
async function getAllMembers(sock, jid) {
    const meta = await sock.groupMetadata(jid)

    return meta.participants
        .map(p => p.id)
        .filter(Boolean)
}

/**
 * Ambil admin grup.
 */
async function getAdmins(sock, jid) {
    const meta = await sock.groupMetadata(jid)

    return meta.participants
        .filter(
            p =>
                p.admin === "admin" ||
                p.admin === "superadmin"
        )
        .map(p => p.id)
        .filter(Boolean)
}

/**
 * Hidetag text biasa.
 */
async function hidetag(ctx) {
    const { sock, m, jid, text } = ctx

    const adminOnly =
        /(^|\s)-a\b/.test(text)

    const invisible =
        /(^|\s)-i\b/.test(text)

    const body = invisible
        ? INVISIBLE
        : text
            .replace(/(^|\s)-a\b/, " ")
            .replace(/(^|\s)-i\b/, " ")
            .trim()

    if (!invisible && !body) {
        return m.arashirep(`empty message\n\n${HELP}`)
    }

    const mentions = adminOnly
        ? await getAdmins(sock, jid)
        : await getAllMembers(sock, jid)

    if (!mentions.length) {
        return m.arashirep("❌ no targets")
    }

    return sock.sendMessage(
        jid,
        {
            text: body,
            mentions
        },
        {
            quoted: m.raw
        }
    )
}

/**
 * Cari semua object yang punya contextInfo.
 *
 * Message WhatsApp bisa memiliki struktur berbeda,
 * terutama nativeFlow / interactive / buttons / viewOnce.
 */
function injectMentions(node, mentions) {
    if (!node || typeof node !== "object") {
        return
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            injectMentions(item, mentions)
        }

        return
    }

    for (const [key, value] of Object.entries(node)) {
        if (!value || typeof value !== "object") {
            continue
        }

        if (key === "contextInfo") {
            value.mentionedJid = mentions

            continue
        }

        injectMentions(value, mentions)
    }
}

/**
 * Relay quoted message + mention semua member.
 */
async function relay(ctx) {
    const { sock, m, jid, q } = ctx

    const raw =
        q?.fullMessage?.message ||
        q?.message

    if (!raw) {
        return m.arashirep("❌ unsupported message")
    }

    const mentions = await getAllMembers(sock, jid)

    if (!mentions.length) {
        return m.arashirep("❌ no targets")
    }

    /*
     * Jangan mutate message asli dari quoted message.
     */
    const content =
        typeof structuredClone === "function"
            ? structuredClone(raw)
            : JSON.parse(JSON.stringify(raw))

    /*
     * Hapus node yang tidak perlu direlay.
     */
    const {
        senderKeyDistributionMessage,
        messageContextInfo,
        ...relayContent
    } = content

    /*
     * Inject mention ke contextInfo.
     *
     * Ini yang membuat relay ikut melakukan
     * mention terhadap semua member grup.
     */
    injectMentions(relayContent, mentions)

    const serialized =
        JSON.stringify(relayContent)

    const isInteractive =
        serialized.includes("nativeFlowMessage") ||
        serialized.includes("interactiveMessage")

    const additionalNodes = isInteractive
        ? [
            {
                tag: "biz",
                attrs: {},
                content: [
                    {
                        tag: "interactive",
                        attrs: {
                            type: "native_flow",
                            v: "1"
                        },
                        content: [
                            {
                                tag: "native_flow",
                                attrs: {
                                    v: "9",
                                    name: "mixed"
                                }
                            }
                        ]
                    }
                ]
            }
        ]
        : undefined

    try {
        await sock.relayMessage(
            jid,
            relayContent,
            {
                messageId: "PP" + Date.now(),
                participant: "",
                additionalNodes
            }
        )
    } catch (e) {
        return m.arashirep(`❌ ${e.message}`)
    }
}

async function run(ctx) {
    const { m, jid, text, q } = ctx

    if (!isJidGroup(jid)) {
        return m.arashirep("group only")
    }

    if (!isAdmin(ctx)) {
        return
    }

    const flagsOnly =
        /^\s*(-a\b|-i\b|\s)*$/.test(text || "")

    /*
     * Ada text:
     *   ht hello
     *   ht -a hello
     *   ht -i hello
     */
    if (text && !flagsOnly) {
        return hidetag(ctx)
    }

    /*
     * Tidak ada text + reply:
     * relay quoted message + tag semua member.
     */
    if (!text && q) {
        return relay(ctx)
    }

    /*
     * Tidak ada text dan tidak reply.
     */
    if (!text && !q) {
        return m.arashirep(HELP)
    }

    return hidetag(ctx)
}

const plugin = {
    run,
    name: "hidetag + relay",
    commands: ["ht", "h"],
    categories: ["group"],
    description: HELP
}

plugin.meta = {
    filename: "hidetag.js",
    version: "2",
    author: config.devName,
    path: "group",
    note: "hidetag all/admin + relay quoted message dengan mention semua member"
}

export default plugin