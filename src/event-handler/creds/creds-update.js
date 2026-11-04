import { customAuth } from '#core/auth.js'
import { contactStore } from '#store/contact-store.js'
import { jidNormalizedUser } from 'baileys'

/**
 * 
 * @param {import ('baileys').BaileysEventMap['creds.update']} bem 
 * @param {import ('baileys').WASocket} sock 
 * @returns {Promise<undefined>}
 */
const handlerCredsUpdate = async (bem, sock) => {
    await customAuth.saveCreds()

    // kode ini untuk menambahkan kontak bot ke cache dan database
    if (Object.keys(bem).length === 1) {
        if (bem.me) {
            const { lid, id, name } = bem.me
            contactStore.upsertAndGet({
                lid: jidNormalizedUser(lid),
                pn: jidNormalizedUser(id),
                name: name
            })
        }
    }
}

export { handlerCredsUpdate }