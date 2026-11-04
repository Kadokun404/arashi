import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

const THERESAV_API = "https://api.theresav.eu/api/bypass/ouo"
const THERESAV_KEY = config.apikey.theresav

const OUO_REGEX = /https?:\/\/(?:www\.)?ouo\.(?:io|press)\/[^\s]+/i

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, sock, jid, q, text, command, prefix } = ctx

    const input = text || q?.text || ""
    const url = input.match(OUO_REGEX)?.[0]

    if (!url) {
        return m.arashirep(
            `# cara penggunaan\n\n` +
            `> masukin url ouo.io atau reply pesan yang ada url-nya\n\n` +
            `# contoh\n` +
            `> ${prefix ?? ""}${command} https://ouo.io/xxxxxx`
        )
    }

    await m.react("⏳")

    const started = Date.now()

    try {
        const res = await fetch(
            `${THERESAV_API}?url=${encodeURIComponent(url)}`,
            {
                headers: { "x-apikey": THERESAV_KEY },
                signal: AbortSignal.timeout(90000)
            }
        )

        if (!res.ok) throw new Error(`http ${res.status}`)

        const data = await res.json()
        if (!data.status || !data.bypassed_url) {
            throw new Error(data.message || data.error || "gagal bypass")
        }

        const result = data.bypassed_url
        const took = data.execution_time_ms ?? Date.now() - started

        await sock.relayMessage(
            jid,
            {
                interactiveMessage: {
                    header: { title: "Kaelyn.ai" },
                    body: {
                        text:
                            `Done Bypass Link!`
                    },
                    footer: { text: "made by api theresav" },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: "cta_copy",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "copy url",
                                    copy_code: result
                                })
                            },
                            {
                                name: "cta_url",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "visit url",
                                    url: result
                                })
                            }
                        ]
                    },
                    contextInfo: {
                        stanzaId: m.key.id,
                        participant: m.key.participant || m.key.remoteJid,
                        quotedMessage: m.message
                    }
                }
            },
            {
                additionalNodes: [
                    {
                        tag: "biz",
                        attrs: {},
                        content: [
                            {
                                tag: "interactive",
                                attrs: { type: "native_flow", v: "1" },
                                content: [
                                    {
                                        tag: "native_flow",
                                        attrs: { v: "9", name: "mixed" }
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        )

        await m.react("✅")
    } catch (err) {
        await m.react("❌")
        return m.arashirep(`❌ gagal bypass\n\n${err?.message || "error"}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "ouo bypass",
    commands: ["ouo", "ouoio"],
    categories: ["tools"],
    description: "bypass ouo.io menggunakan api theresav"
}

plugin.meta = {
    filename: "ouo.js",
    version: "1.0",
    author: "Kadokun",
    path: "tools",
    note: "hasil dikirim dengan tombol cta_copy dan cta_url"
}

export default plugin