import os from "node:os"
import { execSync } from "node:child_process"
import sharp from "sharp"
import { config } from "#root/config.js"

/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

function getStatus(ms) {
    if (ms < 300) return "Excellent"
    if (ms < 800) return "Good"
    if (ms < 1500) return "Fair"
    return "Slow"
}

function fmtUptime(seconds) {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)

    return `${d}d ${h}h ${m}m ${s}s`
}

function getRam() {
    const total = os.totalmem()
    const free = os.freemem()
    const used = total - free

    return {
        used: (used / 1024 / 1024 / 1024).toFixed(2),
        total: (total / 1024 / 1024 / 1024).toFixed(2),
        pct: ((used / total) * 100).toFixed(1)
    }
}

function getCpuLoad() {
    const load = os.loadavg()[0]
    const cores = os.cpus().length
    const pct = Math.min((load / cores) * 100, 100)

    const label =
        pct < 20
            ? "Idle"
            : pct < 60
                ? "Normal"
                : pct < 85
                    ? "Busy"
                    : "Overload"

    return {
        pct: pct.toFixed(1),
        label
    }
}

function getStorage() {
    try {
        const out = execSync(
            "df -B1 --output=used,size / | tail -1"
        )
            .toString()
            .trim()
            .split(/\s+/)

        const used = Number(out[0])
        const size = Number(out[1])

        if (!Number.isFinite(used) || !Number.isFinite(size) || size <= 0) {
            throw new Error("invalid storage data")
        }

        return {
            used: (used / 1024 / 1024 / 1024).toFixed(2),
            total: (size / 1024 / 1024 / 1024).toFixed(2),
            pct: ((used / size) * 100).toFixed(1)
        }
    } catch {
        return {
            used: "?",
            total: "?",
            pct: "?"
        }
    }
}

/**
 * Ambil thumbnail PP dari sender pesan yang di-quote.
 *
 * @param {any} sock
 * @param {any} q
 * @returns {Promise<string>}
 */
async function getQuotedThumbnail(sock, q) {
    if (!q?.sender) return ""

    try {
        const imageUrl = await sock
            .profilePictureUrl(q.sender, "image")
            .catch(() => null)

        if (!imageUrl) return ""

        const response = await fetch(imageUrl)

        if (!response.ok) return ""

        const arrayBuffer = await response.arrayBuffer()
        const imageBuffer = Buffer.from(arrayBuffer)

        const thumbnailBuffer = await sharp(imageBuffer)
            .resize(300, 300, {
                fit: "cover",
                position: "centre"
            })
            .jpeg({
                quality: 85,
                progressive: true
            })
            .toBuffer()

        return thumbnailBuffer.toString("base64")
    } catch {
        return ""
    }
}

/**
 * @param {PluginCtx} ctx
 * @returns
 */
async function run(ctx) {
    const {
        m,
        q,
        sock
    } = ctx

    const jid =
        m?.chat?.jid ||
        m?.key?.remoteJid

    if (!jid) {
        return await m.arashirep(
            "gagal ambil jid, cek struktur ctx.m nya"
        )
    }

    /*
     * q = wrapper quoted message dari framework kamu.
     *
     * Kalau ctx.q tidak tersedia, fallback ke .
     */
    const quoted = q || q?.message || null

    const start = Date.now()

    const messageTimestamp =
        m?.messageTimestamp
            ? Number(m.messageTimestamp) * 1000
            : start

    const responseMs =
        Math.max(0, start - messageTimestamp)

    const apiStart = Date.now()

    try {
        await sock.sendPresenceUpdate(
            "available",
            jid
        )
    } catch {}

    const apiPing =
        Date.now() - apiStart

    const ram = getRam()
    const storage = getStorage()
    const cpu = getCpuLoad()

    const botUptime =
        fmtUptime(process.uptime())

    const serverUptime =
        fmtUptime(os.uptime())

    const cpus = os.cpus()

    const cpuModel =
        cpus[0]?.model?.trim() ||
        "Unknown"

    const cores =
        cpus.length

    const speedGhz =
        cpus[0]?.speed
            ? (cpus[0].speed / 1000).toFixed(2)
            : "?"

    /*
     * Ambil thumbnail hanya kalau ada q.
     */
    const thumbnailBase64 =
        quoted
            ? await getQuotedThumbnail(sock, quoted)
            : ""

    /*
     * Data quoted.
     *
     * Berdasarkan wrapper yang kamu kasih:
     *
     * q.key.id
     * q.key.participant
     * q.sender
     * q.text
     */
    const quotedId =
        quoted?.key?.id ||
        m?.key?.id ||
        `3EB${Date.now().toString(16).toUpperCase()}`

    const quotedSender =
        quoted?.sender ||
        quoted?.key?.participant ||
        m?.sender ||
        jid

    const quotedText =
        quoted?.text ||
        quoted?.content ||
        quoted?.body ||
        "spesifikasi server"

    const quotedRemoteJid =
        quoted?.key?.remoteJid ||
        quoted?.chat?.jid ||
        jid

    /*
     * Context info.
     */
    const contextInfo = {
        mentionedJid: [],
        groupMentions: [],
        statusAttributions: [],

        stanzaId: quotedId,

        participant: quotedSender,

        quotedMessage: {
            orderMessage: {
                thumbnail: thumbnailBase64,
                itemCount: 1,
                message: quotedText
            }
        },

        remoteJid: quotedRemoteJid
    }

    /*
     * Native Flow.
     */
    const rawContent = {
        messageContextInfo: {
            threadId: [],

            deviceListMetadata: {
                senderKeyIndexes: [],
                recipientKeyIndexes: []
            },

            deviceListMetadataVersion: 2
        },

        interactiveMessage: {
            header: {
                title: "Server Performance",
                hasMediaAttachment: false
            },

            body: {
                text:
                    "*Bot Performance*\n\n" +
                    `› Response: ${responseMs} ms — ${getStatus(responseMs)}\n` +
                    `› API Ping: ${apiPing} ms\n` +
                    `› RAM: ${ram.used} GB / ${ram.total} GB (${ram.pct}%)\n` +
                    `› Storage: ${storage.used} GB / ${storage.total} GB (${storage.pct}%)\n` +
                    `› CPU Load: ${cpu.pct}% — ${cpu.label}\n` +
                    `› Bot Uptime: ${botUptime}`
            },

            footer: {
                text:
                    `© ${config.botName} - Reisha.dev`
            },

            nativeFlowMessage: {
                buttons: [
                    {
                        name: "booking_confirmation",

                        buttonParamsJson:
                            JSON.stringify({
                                start_datetime:
                                    new Date().toISOString(),

                                end_datetime:
                                    new Date(
                                        Date.now() +
                                        10 * 60000
                                    ).toISOString(),

                                location:
                                    "Tokyo, Japan",

                                booking_url:
                                    "https://vvip.freishaa.my.id",

                                phone_number:
                                    "6285129684949",

                                booking_management_url:
                                    "vvip.freishaa.my.id",

                                description:
                                    `› OS: ${os.type()} ${os.release()}\n` +
                                    `› CPU: ${cpuModel}\n` +
                                    `› Cores: ${cores} @ ${speedGhz} GHz\n` +
                                    `› Platform: ${os.platform()} ${os.arch()}\n` +
                                    `› Node.js: ${process.version}\n` +
                                    `› Server Up: ${serverUptime}`,

                                email:
                                    "freishaa@my.id",

                                display_text:
                                    "📊 Lihat Spek Server",

                                display_content: {
                                    display_language: "id",

                                    display_meeting_type:
                                        "🖥️ Server Monitor",

                                    display_bottom_sheet_header:
                                        "Server Specifications",

                                    display_add_to_calendar_cta_text:
                                        "⏱️ Cek Uptime",

                                    display_view_on_maps_cta_text:
                                        "📍 Lokasi Server",

                                    display_manage_booking_cta_text:
                                        "🌐 Kunjungi Web",

                                    display_manage_booking_not_supported_text:
                                        "Info tidak tersedia",

                                    display_read_more:
                                        "Lihat Detail Lengkap »"
                                }
                            })
                    }
                ],

                messageParamsJson:
                    JSON.stringify({})
            }
        },

        contextInfo
    }

    const messageId =
        "PP" + Date.now()

    await sock.relayMessage(
        jid,
        rawContent,
        {
            messageId,

            additionalNodes: [
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
        }
    )

    return messageId
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,

    name: "ping",

    commands: ["os"],

    categories: ["system"],

    description:
        "cek performa bot & server"
}

plugin.meta = {
    filename: "os.js",
    version: "2",
    author: config.devName,
    note:
        "native flow interactive message dengan quoted order thumbnail",
    path: "main"
}

export default plugin