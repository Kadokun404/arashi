import { jidNormalizedUser } from "baileys"
import { contactStore } from "#store/contact-store.js"

/**
 * @typedef {object} ResolvedTarget
 * @property {string|undefined} lid lid target, format 123@lid
 * @property {string|undefined} pn nomor hp target, format 123@s.whatsapp.net
 * @property {string|undefined} name nama target (kalau ketauan dari cache)
 * @property {string|undefined} argument sisa teks setelah target, contoh command list buat trust/pam ("menu ! !!")
 */

/**
 * cari kontak dengan cocokin 1-3 token pertama dari teks sebagai nama,
 * dari yang paling banyak kata dulu (biar nama 2-3 kata kaya "reisha amelia"
 * juga kena, bukan cuma token pertama doang)
 * @param {string} raw teks mentah (udah di trim)
 * @returns {{contact: import("../types/types.js").contactCache, argument: string|undefined}|undefined}
 */
function findContactByNamePrefix(raw) {
    if (!raw) return undefined
    const tokens = raw.split(/\s+/)
    const maxWords = Math.min(tokens.length, 3)

    for (let wordCount = maxWords; wordCount >= 1; wordCount--) {
        const candidateName = tokens.slice(0, wordCount).join(" ")
        const contact = contactStore.getByName(candidateName)
        if (contact) {
            return { contact, argument: tokens.slice(wordCount).join(" ").trim() || undefined }
        }
    }
    return undefined
}

/**
 * resolve target dari ctx, urutan priority nya:
 * 1. reply ke pesan orang (q.contact)
 * 2. mention/tag di teks, contoh "@6281234567890 menu ! !!"
 * 3. nomor manual di awal teks, contoh "6281234567890 menu ! !!"
 * 4. nama, cari di contact cache, contoh "reisha menu ! !!" (fallback
 *    kalau bukan reply/mention/nomor, jadi gak harus reply/tag lagi)
 * @param {import("../types/types.js").PluginCtx} ctx
 * @returns {ResolvedTarget}
 */
const resolveTarget = (ctx) => {
    const { m, q, text } = ctx

    // 1. reply ke orang
    if (q?.contact?.lid) {
        return {
            lid: q.contact.lid,
            pn: q.contact.pn,
            name: q.contact.name,
            argument: (text || "").trim() || undefined
        }
    }

    // 2. mention / tag
    const mentionedJid = m?.message?.[m?.content]?.contextInfo?.mentionedJid
    if (mentionedJid?.length) {
        const targetLid = mentionedJid[0]
        const contact = contactStore.getByLid(targetLid)
        const argument = (text || "").replace(/@\d+/, "").trim() || undefined
        return {
            lid: targetLid,
            pn: contact?.pn,
            name: contact?.name,
            argument
        }
    }

    // 3. nomor manual di awal teks
    const raw = (text || "").trim()
    if (!raw) return { lid: undefined, pn: undefined, name: undefined, argument: undefined }

    const firstToken = raw.split(/\s+/)[0]
    const numberOnly = firstToken.replace(/[^0-9]/g, "")

    if (numberOnly) {
        const pn = jidNormalizedUser(`${numberOnly}@s.whatsapp.net`)
        const contact = contactStore.getByPn(pn)
        const argument = raw.slice(firstToken.length).trim() || undefined

        return {
            lid: contact?.lid,
            pn,
            name: contact?.name,
            argument
        }
    }

    // 4. nama (fallback kalau bukan reply/mention/nomor)
    const byName = findContactByNamePrefix(raw)
    if (byName) {
        return {
            lid: byName.contact.lid,
            pn: byName.contact.pn,
            name: byName.contact.name,
            argument: byName.argument
        }
    }

    return { lid: undefined, pn: undefined, name: undefined, argument: raw || undefined }
}

/**
 * @typedef {object} ResolvedTargetMulti
 * @property {string|undefined} lid
 * @property {string|undefined} pn
 * @property {string|undefined} name
 */

/**
 * resolve BANYAK target sekaligus dari ctx, buat command yang butuh multi-user
 * (contoh: *pam grant @user1 @user2 ping*). urutan priority nya:
 * 1. reply ke pesan orang (q.contact) -> 1 target
 * 2. semua mention/tag di teks, contoh "@user1 @user2 ping" -> banyak target
 * 3. nomor manual di awal teks (cuma 1, sama kaya resolveTarget)
 * @param {import("../types/types.js").PluginCtx} ctx
 * @returns {{targets: ResolvedTargetMulti[], argument: string|undefined}}
 */
const resolveTargets = (ctx) => {
    const { m, q, text } = ctx

    // 1. reply ke orang (cuma bisa 1 target)
    if (q?.contact?.lid) {
        return {
            targets: [{ lid: q.contact.lid, pn: q.contact.pn, name: q.contact.name }],
            argument: (text || "").trim() || undefined
        }
    }

    // 2. semua mention / tag di teks
    const mentionedJid = m?.message?.[m?.content]?.contextInfo?.mentionedJid
    if (mentionedJid?.length) {
        const targets = mentionedJid.map(targetLid => {
            const contact = contactStore.getByLid(targetLid)
            return { lid: targetLid, pn: contact?.pn, name: contact?.name }
        })
        // buang semua token "@angka" dari teks, sisanya jadi argument (contoh: nama command)
        const argument = (text || "").replace(/@\d+/g, "").trim() || undefined
        return { targets, argument }
    }

    // 3. nomor manual di awal teks (fallback, cuma 1 target)
    const raw = (text || "").trim()
    if (!raw) return { targets: [], argument: undefined }

    const firstToken = raw.split(/\s+/)[0]
    const numberOnly = firstToken.replace(/[^0-9]/g, "")
    if (!numberOnly) return { targets: [], argument: raw || undefined }

    const pn = jidNormalizedUser(`${numberOnly}@s.whatsapp.net`)
    const contact = contactStore.getByPn(pn)
    const argument = raw.slice(firstToken.length).trim() || undefined

    return {
        targets: [{ lid: contact?.lid, pn, name: contact?.name }],
        argument
    }
}

export { resolveTarget, resolveTargets }
