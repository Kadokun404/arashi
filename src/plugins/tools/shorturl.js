import { config } from "#root/config.js"
/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, q, text, jid } = ctx

    const input = (q?.text || text)?.trim()

    if (!input) {
        return await m.arashirep("masukkan url yang ingin diperpendek")
    }

    try {
        const res = await fetch(`https://keyrafara.com/tools/shorten?url=${encodeURIComponent(input)}`)
        const json = await res.json()

        if (!json.status || !json.result) {
            return await m.arashirep("❌ gagal mempersingkat url")
        }

        const { short_url, url } = json.result

        const content = {
            interactiveMessage: {
                header: {
                    title: "url shortener"
                },
                body: {
                    text: `original : ${url}\nshort : ${short_url}`
                },
                footer: {
                    text: "powered by keyrafara.com"
                },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "cta_copy",
                            buttonParamsJson: JSON.stringify({
                                display_text: "copy short url",
                                copy_code: short_url
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "visit url",
                                url: short_url
                            })
                        }
                    ],
                    messageParamsJson: ""
                }
            }
        }

        await sock.relayMessage(jid, content, {
            messageId: "MINAMIW" + Date.now(),
            additionalNodes: [{
                tag: "biz",
                attrs: {},
                content: [{
                    tag: "interactive",
                    attrs: { type: "native_flow", v: "1" },
                    content: [{
                        tag: "native_flow",
                        attrs: { v: "9", name: "mixed" }
                    }]
                }]
            }]
        })

    } catch (err) {
        console.error(err)
        return await m.arashirep(`❌ error: ${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "url shortener",
    commands: ["su", "shorten", "shorturl"],
    categories: ["tools"],
    description: "mempersingkat url"
}

plugin.meta = {
    filename: "shorturl.js",
    author: config.devName,
    note: "",
    version: "1",
    path: "tools"
}

export default plugin