/**@import {chatSerialize} from '../store/chat-store.js' */

import { jidDecode } from 'baileys'
import { longNormalizer } from '#core/utils.js'

/**
 * fungsi ini mengubah WAMessage menjadi type chatBase yang nantinya masuk ke fungsi upsertAndGet di objek chatStore
 * dari fungsi upsertAndGet, di return type chatDb yang lebih lengkap dan masuklah ke m.chat, gitu ges kira kira
 * @param {import("baileys").WAMessage} WAM wa message
 * @returns {chatSerialize|undefined} the return
 */
const chatSerialize = (WAM) => {
    const { remoteJid } = WAM?.key
    const server = jidDecode(remoteJid).server
    const timestamp = longNormalizer(WAM?.messageTimestamp)

    // ini beberapa yg gw approve
    if (server === "lid" ||
        server === "bot" ||
        server === "g.us" ||
        server === "broadcast") {
        return {
            jid: remoteJid,
            name: undefined,
            timestamp
        }
    } else {
        return undefined
    }
}

export { chatSerialize }