/**
 * @import {WASocket, AnyMessageContent, MiscMessageGenerationOptions} from "baileys"
 */

import { isJidGroup } from "baileys"
// levvleys nambahin opsi "onTarget" ke proses relay pesan baileys, biar pesan
// yang di kirim bot (khusus chat PRIBADI) juga ke sync/ke liat di HP sender
// sendiri (device lain punya sender), bukan cuma nyampe ke lawan chat doang.
// package ini cuma nge-patch behaviour relay message nya baileys, jadi cukup
// di import sekali aja di sini, gak perlu di pake buat bikin socket baru.
import "levvleys"

/**
 * helper buat kirim pesan lewat sock, dengan opsi `onTarget` biar sender juga
 * bisa liat pesan yang di kirim bot di HP nya sendiri (device lain).
 * defaultnya onTarget cuma otomatis nyala di chat PRIBADI, soalnya di grup
 * gak relevan/percuma.
 *
 * @param {WASocket} sock
 * @param {string} jid tujuan pesan, format 123@s.whatsapp.net / 123@lid
 * @param {AnyMessageContent} content isi pesan, sama kaya param ke-2 sock.sendMessage
 * @param {MiscMessageGenerationOptions & {onTarget?: boolean}} [options]
 * onTarget: true = sender ikut liat pesan ini di device nya sendiri (private chat aja)
 * @returns {Promise<import("baileys").proto.IWebMessageInfo | undefined>}
 */
const relayMessage = async (sock, jid, content, options = {}) => {
    const { onTarget, ...rest } = options

    // kalau onTarget gak di set manual, nyalain otomatis khusus chat pribadi
    const shouldTargetSelf = onTarget ?? !isJidGroup(jid)

    return await sock.sendMessage(jid, content, {
        ...rest,
        onTarget: shouldTargetSelf
    })
}

export { relayMessage }
