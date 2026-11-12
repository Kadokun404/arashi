
// store import
import { chatStore } from "../store/chat-store.js"
import { contactStore } from "../store/contact-store.js"
import { groupMetadataStore } from "../store/group-metadata-store.js"
import { memberLabelStore } from "../store/member-label-store.js"
import { messageStore } from "../store/make-in-memory-store.js"

// serialize import
import { contactSerialize } from "./contact-serialize.js"
import { chatSerialize } from "./chat-serializer.js"
import { buttonSerialize } from "./button-serializer.js"
import { quotedMessageSerialize } from "./quoted-serializer.js"

// message utility import
import {
    download,
    react,
    reply,
    arashirep,
    sendImage,
    sendVideo,
    sendVn,
    sendAudio,
    sendDocu,
    sendSticker,
    sendContact
} from "./messages-function-bind.js"

import { downloadMediaMessage, getContentType, isJidGroup, normalizeMessageContent } from "baileys"

/**@import {WAMessage, WASocket, getContentType, proto} from 'baileys*/
/**@import {buttonSerialize} from './button-serializer.js' */
/**
 * @import {messageSerialize } from "../types/types.js"
 */


/**
 * wakwau
 * @param {WAMessage} WAM 
 * @param {WASocket} sock
 * @returns {messageSerialize}
 */

const messageSerialize = (WAM, sock) => {
    if (!WAM) return WAM
    if (WAM._serialized) return WAM

    // m.chat
    const chatSerialized = chatSerialize(WAM)
    const chat = chatStore.upsertAndGet(chatSerialized)
    WAM.chat = chat

    // m.contact
    const contactSerialized = contactSerialize(WAM, sock)
    const contact = contactStore.upsertAndGet(contactSerialized)
    WAM.contact = contact

    // m.button
    Object.defineProperty(WAM, "button", {
        get() {
            return buttonSerialize(WAM)
        },
        enumerable: false,
        configurable: true
    })

    // m.group
    let group = undefined
    if (isJidGroup(WAM.key?.remoteJid) && contact && chat) {
        const admin = groupMetadataStore.getAllAdminByGroupJid(WAM.key?.remoteJid)
        const memberLabelGroup = memberLabelStore.getAllMemberLabel(WAM.key.remoteJid)
        group = {
            admin: admin?.[contact.lid],
            label: memberLabelGroup?.[contact?.lid]
        }
    }
    WAM.group = group

    // m.q
    Object.defineProperty(WAM, "q", {
        get() {
            return quotedMessageSerialize(WAM, sock, messageStore)
        },
        configurable: true
    })

    // [SHORTCUT]

    // m.content
    /**@type { keyof proto.IMessage} */
    let content = getContentType(WAM.message)
    if (!content && WAM.message?.eventMessage) content = "eventMessage"
    if (!content && WAM.message?.eventInviteMessage) content = "eventInviteMessage"
    WAM.content = content

    // m.text
    const ct = WAM.message?.[content]
    const text = WAM?.message?.conversation ||
        ct?.text ||
        ct?.caption ||
        ct?.name ||
        ct?.eventTitle ||
        ct?.description ||
        ct?.message?.documentMessage?.caption ||
        ct?.message?.imageMessage?.caption ||
        ct?.message?.videoMessage?.caption ||
        ct?.body?.text
    WAM.text = text

    // m.sender
    WAM.sender = contact?.lid

    // bonus.. fungsi buat eval evalan
    WAM.download = download
    WAM.react = react
    WAM.reply = reply
    WAM.arashirep = arashirep
    WAM.arashireply = arashirep

    // helper media shortcuts
    WAM.sendImage = sendImage
    WAM.sendVideo = sendVideo
    WAM.sendVn = sendVn
    WAM.sendAudio = sendAudio
    WAM.sendDocu = sendDocu
    WAM.sendSticker = sendSticker
    WAM.sendContact = sendContact

    //WAM.sock = sock
    Object.defineProperty(WAM, "sock", {
        get() {
            return sock
        },
        enumerable: false,
        configurable: true
    })

    WAM._serialized = true
    return WAM
}




export { messageSerialize }
