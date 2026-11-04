/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import crypto from "node:crypto"
import { config } from "#root/config.js"

const base_url = "https://www.chatday.ai"

const baseHeaders = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K)",
    "Origin": base_url,
    "Referer": `${base_url}/chat`
}

async function signInAnonymous() {
    const r = await fetch(`${base_url}/api/auth/sign-in/anonymous`, {
        method: "POST",
        headers: {
            ...baseHeaders,
            "Content-Type": "application/json"
        },
        body: "{}"
    })

    if (!r.ok) {
        throw new Error(`Auth Error: ${r.status}`)
    }

    const setCookie = r.headers.getSetCookie?.() ??
        [r.headers.get("set-cookie")].filter(Boolean)

    const cookie = setCookie
        .map(c => c.split(";")[0])
        .join("; ")

    return { cookie }
}

async function chatHaiku(prompt) {
    const auth = await signInAnonymous()

    const r = await fetch(`${base_url}/api/v2/chat/anonymous`, {
        method: "POST",
        headers: {
            ...baseHeaders,
            "Content-Type": "application/json",
            "Cookie": auth.cookie,
            "Accept": "text/event-stream"
        },
        body: JSON.stringify({
            content: prompt,
            model: "anthropic/claude-haiku-4.5",
            visitorId: crypto.randomUUID().replace(/-/g, ""),
            conversationId: crypto.randomUUID().replace(/-/g, "")
        })
    })

    if (!r.ok) {
        throw new Error(`Server Error: ${r.status}`)
    }

    const reader = r.body.getReader()
    const decoder = new TextDecoder()

    let buffer = ""
    let result = ""

    while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split("\n")
        buffer = lines.pop()

        for (const line of lines) {
            if (!line.startsWith("data:")) continue

            const payload = line.slice(5).trim()
            if (!payload) continue

            try {
                const data = JSON.parse(payload)

                if (
                    data.type === "text-delta" &&
                    typeof data.delta === "string"
                ) {
                    result += data.delta
                }
            } catch {}
        }
    }

    return result
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m } = ctx

    const prompt = String(
        ctx.text ??
        m?.text ??
        m?.body ??
        ""
    ).replace(/^claude\s*/i, "").trim()

    if (!prompt) {
        return m.arashirep("Contoh: claude hari ini hari apa?")
    }

    try {
        const response = await chatHaiku(prompt)

        if (!response) {
            throw new Error("Respon kosong dari server AI.")
        }

        await m.arashirep(response)
    } catch (err) {
        await m.arashirep(`*[CLAUDE ERROR]* ⚠️\n${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "claude-haiku",
    commands: ["claude"],
    categories: ["ai"],
    description: "Chat dengan Claude Haiku 4.5"
}

plugin.meta = {
    filename: "claude-haiku.js",
    version: "2.0.0",
    author: config.devName,
    note: "Claude Haiku tanpa session",
    path: "ai"
}

export default plugin