import { groupMetadataStore } from "#store/group-metadata-store.js"

/**
 * cek apakah suatu contact admin/superadmin di grup ini.
 *
 * kenapa gak langsung pake `m.group.admin` aja? soalnya itu di isi dari cache
 * lokal (#cacheAdmin di group-metadata-store.js) yang cuma ke update lewat
 * event (groups.upsert / group-participants.update) atau lewat db pas bot
 * start. kalau ada promote/demote yang kejadian pas bot lagi offline, atau
 * grup nya emang belum pernah di sync penuh, cache nya bisa nyasar/kosong
 * padahal orangnya beneran admin di whatsapp.
 *
 * disini kita coba cache dulu (cepet, gak nge-hit whatsapp), baru kalau
 * hasilnya bukan admin, fallback ke groupMetadataStore.getGroupMetadata()
 * yang bakal fetch live ke whatsapp KALAU emang belum ke cache, sekalian
 * nyimpen ulang ke db/cache biar kedepannya gak perlu fetch lagi
 *
 * @param {object} param
 * @param {import("baileys").WASocket} param.sock
 * @param {import("#types/types.js").messageSerialize} param.m
 * @param {string} param.jid jid grup
 * @returns {Promise<boolean>}
 */
async function isGroupAdmin({ sock, m, jid }) {
    if (m?.group?.admin) return true
    if (!m?.contact?.lid) return false

    try {
        const metadata = await groupMetadataStore.getGroupMetadata(jid, sock)
        const participant = metadata?.participants?.find(p => p.id === m.contact.lid)
        return !!participant?.admin
    } catch (e) {
        console.error(`[group-admin] gagal cek admin live`, e)
        return false
    }
}

/** alias, biar konsisten sama naming isSuperAdmin/isBot */
const isAdmin = isGroupAdmin

/**
 * cek apakah suatu contact SUPERADMIN (group owner/creator), bukan cuma admin biasa.
 * sama-sama cache-first lalu fallback live kaya isGroupAdmin, alesannya sama.
 * @param {object} param
 * @param {import("baileys").WASocket} param.sock
 * @param {import("#types/types.js").messageSerialize} param.m
 * @param {string} param.jid jid grup
 * @returns {Promise<boolean>}
 */
async function isSuperAdmin({ sock, m, jid }) {
    if (m?.group?.admin === "superadmin") return true
    if (!m?.contact?.lid) return false

    try {
        const metadata = await groupMetadataStore.getGroupMetadata(jid, sock)
        const participant = metadata?.participants?.find(p => p.id === m.contact.lid)
        return participant?.admin === "superadmin"
    } catch (e) {
        console.error(`[group-admin] gagal cek superadmin live`, e)
        return false
    }
}

/**
 * cek apakah suatu lid/pn adalah bot sendiri (contoh: filter bot dari daftar
 * mention, atau cegah bot ke warn/kick diri sendiri)
 * @param {import("baileys").WASocket} sock
 * @param {string|undefined} lid
 * @param {string|undefined} pn
 * @returns {boolean}
 */
function isBot(sock, lid, pn) {
    return (!!lid && lid === sock?.user?.lid) || (!!pn && pn === sock?.user?.id)
}

/**
 * cek apakah BOT SENDIRI berstatus admin di suatu grup. dipakai fitur yang butuh
 * privilege admin buat jalan (misal hapus pesan orang lain, kick, dll).
 *
 * matching pakai startsWith nomor bot, soalnya sock.user.lid punya suffix device
 * (mis. "123456:35@lid") sedangkan p.id di participants gak ada suffix nya
 * (mis. "123456@lid")
 * @param {object} param
 * @param {import("baileys").WASocket} param.sock
 * @param {string} param.jid jid grup
 * @returns {Promise<boolean>}
 */
async function isBotGroupAdmin({ sock, jid }) {
    try {
        const metadata = await groupMetadataStore.getGroupMetadata(jid, sock)
        const botNumber = sock.user?.lid?.split(":")[0]
        if (!botNumber) return false
        const botParticipant = metadata?.participants?.find(p => p.id.startsWith(botNumber))
        return !!botParticipant?.admin
    } catch (e) {
        console.error(`[group-admin] gagal cek status admin bot`, e)
        return false
    }
}

export { isGroupAdmin, isAdmin, isSuperAdmin, isBot, isBotGroupAdmin }
