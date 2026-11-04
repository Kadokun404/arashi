/**
 * @import {WASocket, WAMessage} from "baileys"
 */
import { generateWAMessageFromContent, prepareWAMessageMedia } from "baileys"

/**
 * @typedef {object} CarouselCard
 * @property {string|Buffer} image
 * @property {string} title
 * @property {string} [body]
 * @property {string} [footer]
 * @property {Array<{ name: string, buttonParamsJson: string }>} [buttons]
 */

/**
 * Mengirim Carousel Message interaktif (kartu swipe horizontal) dengan Baileys
 * @param {WASocket} sock
 * @param {string} jid
 * @param {object} options
 * @param {string} [options.text]
 * @param {string} [options.footer]
 * @param {CarouselCard[]} options.cards
 * @param {WAMessage} [options.quoted]
 */
export async function sendCarousel(sock, jid, { text = "", footer = "", cards = [], quoted } = {}) {
    if (!cards || !cards.length) throw new Error("cards tidak boleh kosong")

    const processedCards = []

    for (const card of cards) {
        let media
        if (card.image) {
            const mediaPayload = typeof card.image === "string" && /^https?:\/\//i.test(card.image)
                ? { url: card.image }
                : card.image

            media = await prepareWAMessageMedia(
                { image: mediaPayload },
                { upload: sock.waUploadToServer }
            )
        }

        const buttons = card.buttons && card.buttons.length > 0
            ? card.buttons
            : [
                {
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                        display_text: "Lihat Gambar HD",
                        url: typeof card.image === "string" ? card.image : "https://pinterest.com",
                        merchant_url: typeof card.image === "string" ? card.image : "https://pinterest.com"
                    })
                }
            ]

        processedCards.push({
            header: {
                title: card.title || "",
                hasMediaAttachment: true,
                imageMessage: media?.imageMessage
            },
            body: {
                text: card.body || card.title || ""
            },
            footer: {
                text: card.footer || ""
            },
            nativeFlowMessage: {
                buttons
            }
        })
    }

    const interactiveMessage = {
        body: {
            text: text || "Silakan swipe kartu di bawah untuk melihat pilihan."
        },
        footer: {
            text: footer || ""
        },
        carouselMessage: {
            cards: processedCards,
            messageVersion: 1
        }
    }

    const msg = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage
            }
        }
    }, { quoted })

    return await sock.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
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
    })
}
