/**
 * pending-group-join-manager.js
 *
 * Nunggu approval join grup (invite link yang butuh persetujuan admin,
 * `joinApprovalMode`). Bot udah "request join" tapi belum resmi jadi
 * anggota sampe admin approve.
 *
 * Cara deteksi udah di-approve: baileys munculin event `groups.upsert`
 * pas bot RESMI jadi anggota grup baru -- termasuk pas join request lama
 * akhirnya di-approve admin. Jadi tinggal cek tiap ada `groups.upsert`,
 * apa group id nya ada di daftar pending kita.
 */

/**
 * @typedef {object} PendingJoinInfo
 * @property {string} requesterJid jid/chat tempat notif "berhasil masuk" dikirim
 * @property {string} groupName
 * @property {number} requestedAt
 */

class PendingGroupJoinManager {
    /** @type {Map<string, PendingJoinInfo>} groupJid -> info */
    #pending = new Map()

    /**
     * @param {string} groupJid
     * @param {{requesterJid: string, groupName: string}} info
     */
    add(groupJid, info) {
        this.#pending.set(groupJid, { ...info, requestedAt: Date.now() })
    }

    /**
     * @param {string} groupJid
     */
    remove(groupJid) {
        this.#pending.delete(groupJid)
    }

    /**
     * dipanggil langsung di dalam sock.ev.process(), bareng store.bind(ev, sock)
     * yang udah ada. cek batch event per-tick, bukan sock.ev.on()
     * @param {import("baileys").BaileysEventMap} ev
     * @param {import("baileys").WASocket} sock
     */
    async bind(ev, sock) {
        if (!this.#pending.size) return
        if (!ev['groups.upsert']) return

        for (const groupMetadata of ev['groups.upsert']) {
            const pendingInfo = this.#pending.get(groupMetadata.id)
            if (!pendingInfo) continue

            this.remove(groupMetadata.id)

            try {
                await sock.sendMessage(pendingInfo.requesterJid, {
                    text: `✅ request join ke *${groupMetadata.subject || pendingInfo.groupName}* udah di-approve, bot berhasil masuk grup nya`
                })
            } catch (e) {
                console.error(`[pending-group-join-manager] gagal kirim notif approved`, e)
            }
        }
    }
}

const pendingGroupJoinManager = new PendingGroupJoinManager()
export { pendingGroupJoinManager }