/**@import {WASocket, WAMessage} from "baileys" */

/**@import {contactCache, contactSerialize} from "../types/types.js" */

import { jidDecode,jidNormalizedUser } from "baileys"
import { longNormalizer } from "#helper/utils/common.js"

/**
 * fungsi ini mengubah WAMessage menjadi contactSerialize yang nantinya masuk ke fungsi upsertAndGet di objek contactStore
 * dari fungsi upsertAndGet, di return type contactCache yang lebih lengkap dan masuklah ke m.contact, gitu ges kira kira
 * @param {WAMessage} WAM wa message
 * @param {WASocket} sock
 * @returns {contactSerialize|undefined} kadang gw return undefined kalau kenapa kenapa, jadi gak selalu sukses ya, lu bikin if buat handle nya
 */

const contactSerialize = (WAM, sock) => {
    const { key, verifiedBizName, pushName: pushNameOriginal } = WAM

    let lid
    let pn
    let name = pushNameOriginal || verifiedBizName
    let updatedAt = longNormalizer(WAM?.messageTimestamp)

    const removeJidServer = jidDecode(key.remoteJid).server

    // gc
    if (removeJidServer === "g.us") {
        if (key.addressingMode === "lid") {
            lid = key?.participant
            pn = key?.participantAlt
        }
    }

    // private chat misal kamu ke bot
    else if (removeJidServer === "lid") {
        if (key.addressingMode === "lid") {
            lid = key?.remoteJid
            pn = key?.remoteJidAlt

            // if dibawah jika pesan di kirim dari nomor bot (pakai akun wa)
            if (key?.fromMe) {
                lid = jidNormalizedUser(sock?.user?.lid)
                pn = jidNormalizedUser(sock?.user?.id)

                // set ulang name
                name = sock?.user?.name
                console.debug({lid, pn, name})
            }
        }
    }

    // status broadcast, gw masih belum yakin ini
    else if (removeJidServer === "broadcast") {
        if (key.addressingMode === "lid") {
            lid = key?.participant
            pn = key?.remoteJidAlt
        }
    }

    // add more return undefined aja kalau misal nya anu :v
    else {
        return undefined
    }

    return {
        lid,
        pn,
        name,
        updatedAt
    }
}

export { contactSerialize }