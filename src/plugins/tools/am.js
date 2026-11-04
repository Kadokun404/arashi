/**
  * @import {PluginCtx, PluginType} from "#types/types.js"
  */

import fs from "fs/promises"
import path from "path"

const API = "https://am.hinatasoft.com/api"
const SESSION_FILE = path.resolve("data/am-session.json")
const SESSION_TIME = 60 * 1000

async function loadSessions() {
    try {
        return JSON.parse(await fs.readFile(SESSION_FILE, "utf8"))
    } catch {
        await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true })
        await fs.writeFile(SESSION_FILE, "{}")
        return {}
    }
}

async function saveSessions(sessions) {
    await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true })
    await fs.writeFile(
        SESSION_FILE,
        JSON.stringify(sessions, null, 2)
    )
}

async function sendLink(email) {
    const res = await fetch(`${API}/send-link`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({ email })
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    return res.json()
}

async function verifyLink(email, link) {
    const res = await fetch(`${API}/verify-link`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            email,
            magicLink: link
        })
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    return res.json()
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, text = "" } = ctx
    const args = text.trim()

    const userId = m.contact?.pn || m.contact?.lid

    if (!userId) {
        return m.arashirep("⚠️ identitas user tidak ditemukan")
    }

    if (!args) {
        return m.arashirep(
            `# cara penggunaan\n\n` +
            `> am send email\n` +
            `> am verif linkverif`
        )
    }

    await m.react("⏳")

    try {
        const [action, ...rest] = args.split(/\s+/)
        const value = rest.join(" ").trim()

        const sessions = await loadSessions()

        if (action === "send") {
            if (!value) {
                return m.arashirep("format: am send email")
            }

            const email = value.toLowerCase()

            const result = await sendLink(email)

            if (!result.success) {
                return m.arashirep(
                    `❌ gagal mengirim magic link\n\n` +
                    `${JSON.stringify(result, null, 2)}`
                )
            }

            sessions[userId] = {
                email,
                createdAt: Date.now(),
                expiresAt: Date.now() + SESSION_TIME
            }

            await saveSessions(sessions)

            await m.arashirep(
                `link berhasil dikirim\n` +
                `email: ${email}\n` +
                `session berlaku: 1 menit\n\n` +
                `> gunakan:\n` +
                `> am verif linkverif`
            )
        } else if (action === "verif") {
            if (!value) {
                return m.arashirep("format: am verif linkverif")
            }

            const session = sessions[userId]

            if (!session) {
                return m.arashirep(
                    `⚠️ session tidak ditemukan\n\n` +
                    `silakan gunakan:\n` +
                    `> am send email`
                )
            }

            if (Date.now() >= session.expiresAt) {
                delete sessions[userId]
                await saveSessions(sessions)

                return m.arashirep(
                    `⚠️ session sudah expired\n\n` +
                    `batas waktu verifikasi adalah 1 menit\n\n` +
                    `silakan gunakan:\n` +
                    `> am send email`
                )
            }

            const result = await verifyLink(
                session.email,
                value
            )

            if (!result.success) {
                return m.arashirep(
                    `⚠️ verifikasi gagal\n\n` +
                    `${result.message || "magic link tidak valid"}`
                )
            }

            delete sessions[userId]
            await saveSessions(sessions)

            const data = result.data || {}

            await m.arashirep(
                `premium berhasil diaktifkan\n` +
                `email: ${data.email || session.email}\n` +
                `status: ${data.membershipStatus || "PREMIUM_ACTIVE"}\n` +
                `plan: ${data.planName || "-"}\n` +
                `valid until: ${data.validUntil || "-"}`
            )
        } else {
            return m.arashirep(
                `command tidak dikenal\n\n` +
                `> am send email\n` +
                `> am verif linkverif`
            )
        }

        await m.react("✅")
    } catch (e) {
        await m.react("❌")
        await m.arashirep(`❌ ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "alight motion premium",
    commands: ["am"],
    categories: ["tools"],
    description: "send dan verify magic link alight motion"
}

plugin.meta = {
    filename: "am.js",
    version: "3.0",
    author: "Kadokun",
    path: "tools",
    note: "session email disimpan di data/am-session.json dan berlaku 1 menit"
}

export default plugin