import { chatStmt } from "../database/table-chats.js"



class ChatStore {
    /**@type {Map<string, chatCache>} */
    #map = new Map()

    constructor() {
        for (const chat of chatStmt.selectAll.iterate()) {
            this.#map.set(chat.jid, { ...chat})
        }
        console.log(`loaded ${this.#map.size} chat`)
    }


    /**
     * todo: benerin deskripsi
     * @param {chatSerialize} chatBase chat base 
     * @returns {chatCache} chat lengkap dengan id dari database
     */
    upsertAndGet = (chatBase) => {
        if(!chatBase) return undefined
        const { jid, name, timestamp } = chatBase
        if(!jid) return undefined
        const chatCache = this.#map.get(jid)
        if (chatCache) {
            let updated = chatCache

            // update name kalau beda
            if (name && chatCache.name !== name) {
                const { id } = updated
                updated = { ...chatStmt.updateNameById.get({ id, name }) }
            }

            // update last_message_at kalau ada timestamp baru dan lebih baru dari yang tersimpan
            if (timestamp && (!updated.last_message_at || timestamp > updated.last_message_at)) {
                const touched = chatStmt.touchTimestampById.get({ id: updated.id, lastMessageAt: timestamp })
                if (touched) updated = { ...touched }
            }

            if (updated !== chatCache) {
                this.#map.set(jid, updated)
                console.log('✨ updated chat', updated)
            }
            return updated

        } else {
            const chatNew = { ...chatStmt.insert.get({
                jid,
                name: name || null,
                lastMessageAt: timestamp || null
            })}
            this.#map.set(chatNew.jid, chatNew)
            console.log('📝 new chat', chatNew)
            return chatNew
        }
    }
}

const chatStore = new ChatStore()

export { chatStore }