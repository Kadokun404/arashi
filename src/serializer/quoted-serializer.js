import { areJidsSameUser, getContentType, jidDecode, isJidGroup } from "baileys";
import { contactStore } from "../store/contact-store.js";
import { chatStore } from "../store/chat-store.js";
import { memberLabelStore } from "../store/member-label-store.js";
import { groupMetadataStore } from "../store/group-metadata-store.js";
import { download, react, reply, del } from "./messages-function-bind.js";

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
        /**@type {WAMessageKey} */
        const key = {
            id: contextInfo?.stanzaId,
            participant: participantJid,
            remoteJid: WAM.key?.remoteJid,
            fromMe: (areJidsSameUser(participantJid, sock?.user?.lid) ||
                areJidsSameUser(participantJid, sock?.user?.id))
        }

        // q.message
        const message = quotedMessage

        // q.fullMessage: FULL raw WAMessage asli (key, messageTimestamp, name,
        // status, dst) hasil cari di cache makeInMemoryStore, pake remoteJid chat
        // ini + stanzaId dari contextInfo. beda sama q.message yang cuma isi
        // contextInfo.quotedMessage doang (kadang WA ngirim versi ringkas/beda
        // dikit dari pesan aslinya pas nge-reply). bisa undefined kalau pesan
        // aslinya belum/gak sempet ke-cache (misal bot baru restart)
        const fullMessage = messageStore?.getMessageSync?.(WAM.key?.remoteJid, contextInfo?.stanzaId)

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
        const content = getContentType(message)

        // q.text
        const ct = message?.[content]
        const text = message?.conversation ||
            ct?.text ||
            ct?.caption ||
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
            name: contact?.name
        }

        // buat eval evalan
        q.download = download
        q.react = react
        q.reply = reply
        q.delete = del

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
