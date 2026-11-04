/**
 * @import {contactSerialize, contactCache} from "../types/types.js"
 */

import { contactStmt } from "../database/table-contacts.js"
import { toJsObject } from "#helper/common.js"


class ContactStore {

    /**@type {Map <string, contactCache>} */
    #map = new Map()

    /**@type {Map <string, string>} */
    #pnToLidMap = new Map()

    #updatePnToLidMap(pn, lid) {
        if (!pn) return undefined
        this.#pnToLidMap.set(pn, lid)
    }

    constructor() {

        // load contact dari db ke map biar cepet buat akses nyah
        for (const row of contactStmt.selectAll.iterate()) {
            this.#map.set(row.lid, toJsObject(row))
        }

        // buat maping pn to lid, tujuannya untuk searching contact by pn,
        [...this.#map].forEach(v => {
            const pn = v[1]?.pn
            const lid = v[0]
            this.#updatePnToLidMap(pn, lid)
        })

        // lapor dulu ke terminal
        console.log(`loaded ${this.#map.size} contact`)
    }

    /**
     * fungsi ini mengembalikan contactCache, ketika cache miss, kalian harus
     * sediakan param lid, pn dan updatedAt, kalau cache hit, maka lid aja boleh
     * tetep akan di return contactCache, kemudian juga ada comparasi name
     * jika ada perbedaan name di cache dengan input, maka akan di lakukan
     * match.. ngikut data name yang baru, cache dan db akan di update
     * @param {contactSerialize} contactSerialize contact serialize, kalau misalnya udah ada di
     * cache boleh isi lid aja,tapi kalau belum ada di cache maka waijb isi lid, pn, updatedAt
     * tapi gpp sih lid aja gpp, buat fleksibilitas
     * @returns {contactCache | undefined} contact cache with db id, lid, pn, 
     * and name kalau ada
     */

    upsertAndGet(contactSerialize) {
        const { lid = undefined, pn, name, updatedAt } = contactSerialize || {}

        // return undefined kalau gk ada lid
        if (!lid) return undefined

        // kalau pn ini sebelumnya udah nempel ke lid LAIN, lepas dulu pn dari
        // row lama itu (beneran di-NULL-in pakai clearPn, BUKAN updateContact
        // yang coalesce - soalnya coalesce(null, pn) balikin pn LAMA, gak
        // pernah beneran ke-NULL) biar gak nabrak UNIQUE constraint pas kita
        // assign pn yang sama ke lid yang sekarang lagi diproses. ini bisa
        // kejadian kalau kontak ganti/reinstall WA jadi WhatsApp assign lid
        // baru buat pn yang sama
        if (pn) {
            const existingLidForPn = this.#pnToLidMap.get(pn)
            if (existingLidForPn && existingLidForPn !== lid) {
                const staleContact = this.#map.get(existingLidForPn)
                if (staleContact) {
                    const dbResult = contactStmt.clearPn.get({ id: staleContact.id })
                    this.#map.set(existingLidForPn, toJsObject(dbResult))
                    console.log(`♻️ pn dipindah dari lid lama`, { pn, from: existingLidForPn, to: lid })
                }
                this.#pnToLidMap.delete(pn)
            }
        }

        const contactCache = this.#map.get(lid)


        // kalau ada cache
        if (contactCache) {


            // kalau ada perbedaan name contactCache dengan name terbaru maka jalankan logic ini

            const isNameUpdate = (contactCache?.name !== name) && name
            const isPnUpdate = (contactCache?.pn !== pn) && pn
            if (isNameUpdate || isPnUpdate) {
                const { id } = contactCache
                const dbResult = contactStmt.updateContact.get({
                    id,
                    pn: pn || null,
                    name: name || null
                })
                const contactCacheUpdated = toJsObject(dbResult)
                this.#map.set(lid, contactCacheUpdated)
                this.#updatePnToLidMap(pn, lid)
                console.log('✨ contact updated', contactCacheUpdated)
                return contactCacheUpdated
            } else {
                return contactCache
            }
        }

        // kalau cache gak ada maka tambah contact ke cache dan db
        else {
            const dbResult = contactStmt.insertNewContact.get({
                lid,
                pn: pn || null,
                name: name || null
            })
            const contactCacheNew = toJsObject(dbResult)
            this.#map.set(lid, contactCacheNew)
            this.#updatePnToLidMap(pn, lid)
            console.log('📝 kontak baru', contactCacheNew)
            return contactCacheNew
        }
    }

    /**
     * searching contact dengan phone number
     * @param {string} pn pn yang benar ya 123@s.whatsapp.net gitu
     * @returns {contactCache | undefined} return undefined jika data gak ada
     */
    getByPn = (pn) => {
        if (typeof (pn) === "object") return undefined
        const lid = this.#pnToLidMap.get(pn)
        if (!lid) return undefined
        return this.#map.get(lid)
    }

    /**
     * resolve contact fleksibel dari jid / pn / lid
     * @param {string} jid
     * @returns {contactCache | undefined}
     */
    resolve = (jid) => {
        if (!jid || typeof jid !== "string") return undefined
        if (jid.endsWith("@lid")) return this.getByLid(jid)
        if (jid.endsWith("@s.whatsapp.net")) return this.getByPn(jid)
        return this.getByPn(`${jid}@s.whatsapp.net`) || this.getByLid(`${jid}@lid`)
    }

    /**
    * searching contact dengan phone number
    * @param {string} id id database yang benar ya
    * @returns {contactCache | undefined} return undefined jika data gak ada
    */
    getById = (id) => {
        // kali ini kita query langsung db nya
        if (typeof (id) === "object") return undefined
        return { ...contactStmt.getById.get({ id }) }
    }

    /**
    * searching contact dengan lid
    * @param {string} lid lid ya bro
    * @returns {contactCache | undefined} return undefined jika data gak ada
    */
    getByLid = (lid) => {
        if (typeof (lid) === "object") return undefined
        return this.#map.get(lid)
    }

    /**
     * searching contact dengan nama (case-insensitive), exact match menang
     * dulu baru fallback ke partial match (contoh "reisha" bisa nemu
     * "Reisha Amelia"). dipake buat command yang mau support nama langsung
     * tanpa reply/tag/nomor, contoh *user trust reisha*
     * @param {string} name nama (atau potongan nama) yang di cari
     * @returns {contactCache | undefined} return undefined jika gak ada yang cocok
     */
    getByName = (name) => {
        const query = (name || "").trim().toLowerCase()
        if (!query) return undefined

        let partialMatch
        for (const contact of this.#map.values()) {
            const contactName = contact?.name?.toLowerCase()
            if (!contactName) continue
            if (contactName === query) return contact
            if (!partialMatch && contactName.includes(query)) partialMatch = contact
        }
        return partialMatch
    }

}

const contactStore = new ContactStore()

export { contactStore }