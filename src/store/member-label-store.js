import { unixTimestampSeconds } from "baileys"
import { groupParticipantsStmt } from "../database/table-group-participants.js"
import { chatStore } from "./chat-store.js"
import { contactStore } from "./contact-store.js"



/**@import {memberLabelBase} from "../serializer/member-label-serialize.js" */

class MemberLabelStore {
    /**@type {Map<string, memberLabelDb>} */
    #memberLabel = new Map()

    constructor() {
        // load all admin from db to cacheAdmin
        const rows = groupParticipantsStmt.getAllMemberLabel.iterate()
        for (const row of rows) {
            const { jid, lid, label } = row
            const ada = this.#memberLabel.has(jid)
            if (!ada) this.#memberLabel.set(jid, {})
            const obj = this.#memberLabel.get(jid)
            obj[lid] = label
        }

    }

    /**
     * 
     * @param {memberLabelBase} awok input nya bro
     * @returns {undefined}
     */

    update = (awok) => {
        const { groupJid, authorLid, authorPn, timestamp, label } = awok
        const chat = chatStore.upsertAndGet({
            jid: groupJid
        })
        const contact = contactStore.upsertAndGet({
            lid: authorLid,
            pn: authorPn
        })
        const now = unixTimestampSeconds()

        // update database
        groupParticipantsStmt.updateMemberLabel.run({
            chatId: chat.id,// -- chats.id
            contactId: contact.id,// -- contacts.id
            label: label || null,// -- label <text/null>
            labelUpdatedAt: timestamp || now,//  -- label_updated_at <timestamp second>
            invitedAt: timestamp || now //  -- invited_at <timestamp second>
        })

        // update cache
        const mapGcLabel = this.#memberLabel.has(awok.groupJid)
        if (!mapGcLabel) this.#memberLabel.set(awok.groupJid, {})

        const gcLabel = this.#memberLabel.get(awok.groupJid)
        if (!awok.label) {
            // user hapus label
            delete gcLabel[awok.authorLid]

        } else {
            gcLabel[awok.authorLid] = awok.label
        }

        // hapus key kalau value kosong
        if (Object.keys(gcLabel).length === 0) {
            this.#memberLabel.delete(awok.groupJid)
        }
    }

    getAllMemberLabel(groupJid) {
        return this.#memberLabel.get(groupJid)
    }
}

const memberLabelStore = new MemberLabelStore()

export { memberLabelStore }