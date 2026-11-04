/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { prepareWAMessageMedia } from 'baileys'

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m } = ctx

    const imageMedia = await prepareWAMessageMedia({
        image: {
            url: 'https://mmg.whatsapp.net/v/t62.7118-24/613719510_1237677731794233_5850045486379063882_n.enc?ccb=11-4&oh=01_Q5Aa5AFlJ596CRuqMm3SIqmdxpK6YAt6o6Uj9j6xouRJ-RQ4Fg&oe=6A927C23&_nc_sid=5e03e0&mms3=true'
        }
    }, {
        upload: sock.waUploadToServer
    })

    await sock.relayMessage(
        m.chat.jid,
        {
            interactiveMessage: {
                header: {
                    title: `Keitsu — Developer`,
                    hasMediaAttachment: true,
                    imageMessage: {
                        ...imageMedia.imageMessage
                    }
                },
                body: {
                    text: `*Keitsu*\n\nBot ini di buat dan di kelola oleh Keitsu.\nHubungi developer kalau ada pertanyaan, bug, atau request fitur.`
                },
                footer: {
                    text: `Keitsu Last Chapter.`
                },
                contextInfo: {
                    mentionedJid: [m.sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363426644875786@newsletter',
                        newsletterName: 'Keitsu',
                        serverMessageId: 1
                    }
                },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "Telegram",
                                url: "https://t.me/kkeitsu",
                                merchant_url: "https://t.me/kkeitsu"
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "WhatsApp",
                                url: "https://wa.me/62882016838574",
                                merchant_url: "https://wa.me/62882016838574"
                            })
                        },
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "Channel",
                                url: "https://whatsapp.com/channel/0029Vb89130K5cDEwU1d2W2a/",
                                merchant_url: "https://whatsapp.com/channel/0029Vb89130K5cDEwU1d2W2a/"
                            })
                        }
                    ],
                    messageParamsJson: JSON.stringify({
                        limited_time_offer: {
                            text: "Keitsu Last Chapter.",
                            url: "https://t.me/kkeitsu",
                            copy_code: "kkeitsu",
                            expiration_time: 4102444800
                        }
                    })
                }
            }
        },
        {
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
        }
    )
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "owner info",
    commands: ["owner", "dev", "creator"],
    categories: ["info"],
    description: "info developer / owner bot"
}

plugin.meta = {
    filename: "owner.js",
    author: "Keitsu",
    note: "interactive message dengan button social links",
    version: "2",
    path: "info"
}

export default plugin