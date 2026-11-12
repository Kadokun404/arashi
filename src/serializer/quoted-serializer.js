import { areJidsSameUser, getContentType, jidDecode, isJidGroup } from "baileys";
import { contactStore } from "../store/contact-store.js";
import { chatStore } from "../store/chat-store.js";
import { memberLabelStore } from "../store/member-label-store.js";
import { groupMetadataStore } from "../store/group-metadata-store.js";
import {
    download,
    react,
    reply,
    del,
    sendImage,
    sendVideo,
    sendVn,
    sendAudio,
    sendDocu,
    sendSticker,
    sendContact
} from "./messages-function-bind.js";

/**
 * @import {WAMessage, WAMessageKey, MessageWithContextInfo, WASocket, proto} from 'baileys'
 * @import {groupKeyMessage, messageSerialize} from '../types/types.js'
 * @import {extra} './messages-serializer.js'
*/

/**
 * 
 * @param {WAMessage} WAM
 * @param {WASocket} sock
 * @param {import("../store/make-in-memory-store.js").messageStore} messageStore
 * @returns {messageSerialize} 
 */

const quotedMessageSerialize = (WAM, sock, messageStore) => {
    /**@type {MessageWithContextInfo} */
    const contentType = getContentType(WAM?.message)
    const quotedMessage = WAM?.message?.[contentType]?.contextInfo?.quotedMessage

    if (quotedMessage) {
        const contextInfo = WAM?.message?.[contentType]?.contextInfo
        const participantJid = contextInfo?.participant

        // q.key
        // q.fullMessage: FULL raw WAMessage asli (coba messageStore in-memory, lalu crmstore sqlite)
        const fullMessage = messageStore?.getMessageSync?.(WAM.key?.remoteJid, contextInfo?.stanzaId) 

        /**@type {WAMessageKey} */
        const key = {
            id: contextInfo?.stanzaId,
            participant: participantJid,
            remoteJid: WAM.key?.remoteJid,
            fromMe: (areJidsSameUser(participantJid, sock?.user?.lid) ||
                areJidsSameUser(participantJid, sock?.user?.id)),
            isViewOnce: Boolean(fullMessage?.key?.isViewOnce || contextInfo?.isViewOnce)
        }

        // q.message
        let message = quotedMessage

        // Fallback jika quotedMessage dikirim kosong `{}` oleh WhatsApp atau jika raw message asli punya metadata lebih lengkap (misal faviconMMSMetadata)
        if (contextInfo?.stanzaId) {
            const stored = fullMessage?.message
            if (stored && Object.keys(stored).length) {
                if (!message || !Object.keys(message).length) {
                    message = stored
                } else if (stored.extendedTextMessage?.faviconMMSMetadata && !message.extendedTextMessage?.faviconMMSMetadata) {
                    message = {
                        ...stored,
                        ...message,
                        extendedTextMessage: {
                            ...stored.extendedTextMessage,
                            ...message.extendedTextMessage,
                            faviconMMSMetadata: stored.extendedTextMessage.faviconMMSMetadata
                        }
                    }
                }
            }
        }

        // q.chat
        const chat = chatStore.upsertAndGet({
            jid: WAM.key?.remoteJid
        })

        // q.contact
        let contact
        const server = jidDecode(participantJid)?.server
        if (server === "s.whatsapp.net") {
            contact = contactStore.getByPn(participantJid)
        } else if (server === "lid") {
            contact = contactStore.upsertAndGet({
                lid: participantJid
            })
        } else {
            contact = undefined
        }

        //q.button gaada ya :v

        /**@type {groupKeyMessage} */
        let group = undefined
        if (isJidGroup(WAM.key?.remoteJid) && contact && chat) {
            const admin = groupMetadataStore.getAllAdminByGroupJid(WAM.key?.remoteJid)
            const memberLabelGroup = memberLabelStore.getAllMemberLabel(WAM.key.remoteJid)
            group = {
                admin: admin?.[contact.lid],
                label: memberLabelGroup?.[contact?.lid]
            }
        }

        // q.content
        /**@type { keyof proto.IMessage} */
        let content = getContentType(message)
        if (!content && message?.eventMessage) content = "eventMessage"
        if (!content && message?.eventInviteMessage) content = "eventInviteMessage"

        // q.text
        const ct = message?.[content]
        const text = message?.conversation ||
            ct?.text ||
            ct?.caption ||
            ct?.name ||
            ct?.eventTitle ||
            ct?.description ||
            ct?.message?.documentMessage?.caption ||
            ct?.message?.imageMessage?.caption ||
            ct?.message?.videoMessage?.caption ||
            ct?.body?.text


        /**@type {messageSerialize} */
        const q = {
            key,
            message,
            fullMessage,
            chat,
            contact,
            content,
            sender: contact?.lid,
            text,
            group,
            name: contact?.name,
            fakeObj: {
                key,
                message,
                participant: participantJid
            }
        }

        // buat eval evalan
        q.download = download
        q.react = react
        q.reply = reply
        q.delete = del

        // helper media shortcuts
        q.sendImage = sendImage
        q.sendVideo = sendVideo
        q.sendVn = sendVn
        q.sendAudio = sendAudio
        q.sendDocu = sendDocu
        q.sendSticker = sendSticker
        q.sendContact = sendContact

        //WAM.sock = sock
        Object.defineProperty(q, "sock", {
            get() {
                return sock
            },
            enumerable: false,
            configurable: false
        })

        return q

    } else {
        return undefined
    }
}

export { quotedMessageSerialize }
