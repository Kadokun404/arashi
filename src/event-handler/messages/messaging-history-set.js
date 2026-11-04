import { contactStore } from "#store/contact-store.js"
import { db } from "#database/database.js"

/**
 * messages upsert handler
 * @param {import ("baileys").WASocket} sock 
 * @param {import ("baileys").BaileysEventMap['messaging-history.set']} bem 
 * @returns {Promise<undefined>}
 */

const handlerMessagingHistorySet = async (bem, sock) => {
    try {
        const { syncType, lidPnMappings, contacts } = bem
        
        if (syncType === 4) {
            const getLidByPn = []
            for (const v of lidPnMappings || []) {
                getLidByPn[v.pn] = v.lid
            }
            const css = contacts.map(v => {
                return {
                    name: v.notify,
                    pn: v.id,
                    lid: getLidByPn[v.id] || v.id
                }
            }).filter(v => Boolean(v.lid))

            db.exec(`BEGIN TRANSACTION`)
            for (const cs of css) {
                contactStore.upsertAndGet(cs)
            }
            db.exec(`COMMIT`)
        }
    }catch(e){
        console.error(`gagal farming`, e, bem)
    }
}

export { handlerMessagingHistorySet }