// serializer
import { memberLabelSerialize } from "../serializer/member-label-serialize.js"
import { participantUpdateSerialize } from "../serializer/participant-update-serialize.js"
import { contactSerialize } from "../serializer/contact-serialize.js"
import { chatSerialize } from "../serializer/chat-serializer.js"

// store
import { groupMetadataStore } from "./group-metadata-store.js"
import { memberLabelStore } from "./member-label-store.js"
import { contactStore } from "./contact-store.js"
import { chatStore } from "./chat-store.js"

import { WAMessageStubType, proto } from "baileys"
import { longNormalizer } from "#helper/common.js"

import { db } from "../database/database.js"

/**@import {BaileysEventMap, WASocket} from "baileys" */

const ProtocolMessageType = proto.Message.ProtocolMessage.Type
// LOOPING UNTUK FARMING DATA

// batch serialize, filtering, and maping to contactSerialize type
/**@type {Map <string, contactBase >} */
const tempContactBases = new Map()

/**@type {Map <string, chatBase>} */
const tempChatBases = new Map()

let contactBaseArray = []
let chatBaseArray = []

/**
 * jalanin fn di dalam satu transaction SQLite. kalau fn throw, rollback dulu
 * baru rethrow error aslinya - biar transaction gak pernah ketinggalan
 * "nyala" gara-gara COMMIT kelewatan gara-gara exception di tengah jalan
 * (ini yang sebelumnya bikin "cannot start a transaction within a transaction"
 * pas ada BEGIN lain nyusul di event batch yang sama)
 * @param {() => void} fn
 */
function runInTransaction(fn) {
    db.exec("BEGIN TRANSACTION")
    try {
        fn()
        db.exec("COMMIT")
    } catch (e) {
        try {
            db.exec("ROLLBACK")
        } catch (rollbackErr) {
            console.error(`[store.js] gagal rollback juga:`, rollbackErr)
        }
        throw e
    }
}

class Store {
    /**
     * @param {BaileysEventMap} ev event map 
     * @param {WASocket} sock*/
    bind(ev, sock) {

        if (ev['messages.upsert']) {
            const { messages, type, requestId } = ev['messages.upsert']

            // APPEND
            if (type === "append") {
                for (const WAM of messages) {

                    // GROUP_PARTICIPANT_LABEL [BISA APPEND / NOTIFI]
                    if (WAM?.message?.protocolMessage?.type === ProtocolMessageType.GROUP_MEMBER_LABEL_CHANGE) {
                        const memberLabelBase = memberLabelSerialize(WAM)
                        memberLabelStore.update(memberLabelBase)
                    }

                    // CONTACT DAN CHAT 

                    // farming contact
                    const contactBase = contactSerialize(WAM)
                    if (contactBase) {
                        if (contactBase.name) {
                            tempContactBases.set(contactBase.lid, contactBase)
                        }
                    } else {
                        console.warn(`append empty contact serialize`, WAM)
                    }

                    // farming chat
                    const chatBase = chatSerialize(WAM)
                    if (chatBase) {
                        tempChatBases.set(chatBase.jid, chatBase)
                    } else {
                        console.warn(`append empty chat serialize`, WAM)
                    }


                    // GROUP_PARTICIPANT_UPDATE
                    if (WAM?.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_ADD) {
                        const base = participantUpdateSerialize(WAM, "add")
                        groupMetadataStore.upsertParticipant(base, sock)
                    }

                    else if (WAM?.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_REMOVE) {
                        const base = participantUpdateSerialize(WAM, "remove")
                        groupMetadataStore.upsertParticipant(base, sock)
                    }

                    else if (WAM?.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_PROMOTE) {
                        const base = participantUpdateSerialize(WAM, "promote")
                        groupMetadataStore.upsertParticipant(base, sock)
                    }

                    else if (WAM?.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_DEMOTE) {
                        const base = participantUpdateSerialize(WAM, "demote")
                        groupMetadataStore.upsertParticipant(base, sock)
                    }

                    else if (WAM?.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_LEAVE) {
                        const base = participantUpdateSerialize(WAM, "remove")
                        groupMetadataStore.upsertParticipant(base, sock)
                    }
                }

                contactBaseArray = Array.from(tempContactBases).map(c => c[1])
                chatBaseArray = Array.from(tempChatBases).map(c => c[1])

                runInTransaction(() => {
                    contactBaseArray.forEach(cs => contactStore.upsertAndGet(cs))
                    chatBaseArray.forEach(cs => chatStore.upsertAndGet(cs))
                })

                tempContactBases.clear()
                tempChatBases.clear()
                contactBaseArray.length = 0
                chatBaseArray.length = 0
            }

            // NOTIFY
            else if (type === "notify") {
                for (const WAM of messages) {
                    // GROUP_PARTICIPANT_LABEL [BISA APPEND / NOTIFI]
                    if (WAM?.message?.protocolMessage?.type === ProtocolMessageType.GROUP_MEMBER_LABEL_CHANGE) {
                        const memberLabelBase = memberLabelSerialize(WAM)
                        memberLabelStore.update(memberLabelBase)
                    }
                }
            }
        }

        if (ev['groups.upsert']) {
            for (const newGroupMetadata of ev['groups.upsert']) {
                groupMetadataStore.upsertGroupMetadata(newGroupMetadata, sock, true)
            }
        }

        if (ev['groups.update']) {
            for (const newGroupMetadata of ev['groups.update']) {
                groupMetadataStore.upsertGroupMetadata(newGroupMetadata, sock)
            }
        }

        // farming contact dari event contacts.upsert / contacts.update (biasanya nyusul
        // pas awal konek atau kalau ada kontak baru yang di sync), sebelumnya cuma
        // messages.upsert append yang di pegang, jadi contact dari sini suka kelewat
        if (ev['contacts.upsert']) {
            runInTransaction(() => {
                for (const rawContact of ev['contacts.upsert']) {
                    const contactBase = {
                        lid: rawContact.lid || rawContact.id,
                        pn: rawContact.lid ? rawContact.id : undefined,
                        name: rawContact.notify || rawContact.name,
                        updatedAt: Math.floor(Date.now() / 1000)
                    }
                    if (contactBase.lid) contactStore.upsertAndGet(contactBase)
                }
            })
        }

        if (ev['contacts.update']) {
            runInTransaction(() => {
                for (const rawContact of ev['contacts.update']) {
                    const contactBase = {
                        lid: rawContact.lid || rawContact.id,
                        pn: rawContact.lid ? rawContact.id : undefined,
                        name: rawContact.notify || rawContact.name,
                        updatedAt: Math.floor(Date.now() / 1000)
                    }
                    if (contactBase.lid) contactStore.upsertAndGet(contactBase)
                }
            })
        }

        // farming chat dari event chats.upsert, biar nama chat kesave walaupun
        // belum pernah ada pesan masuk yang ke append
        if (ev['chats.upsert']) {
            runInTransaction(() => {
                for (const rawChat of ev['chats.upsert']) {
                    if (rawChat?.id) {
                        chatStore.upsertAndGet({
                            jid: rawChat.id,
                            name: rawChat.name
                        })
                    }
                }
            })
        }
    }
}

const store = new Store()
export { store }