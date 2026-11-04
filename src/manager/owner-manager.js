import { trustDb } from "#database/trust-store.js"
import { config } from "#root/config.js"

const fail = (message) => ({ ok: false, message })
const success = (message) => ({ ok: true, message })

class OwnerManager {
    baseOwnerSet = new Set()

    constructor() {
        const baseOwners = Array.isArray(config.devNumb) ? config.devNumb : [config.devNumb]
        baseOwners.filter(Boolean).forEach(numb => this.baseOwnerSet.add(`${numb}@s.whatsapp.net`))
        console.log(`loaded ${this.baseOwnerSet.size} base owner, ${trustDb.data.length} trusted user (json db)`)
    }

    isBaseOwner(pn) {
        if (!pn) return false
        return this.baseOwnerSet.has(pn)
    }

    isTrusted(contact) {
        if (!contact) return false
        const { lid, pn } = contact
        return trustDb.data.some(row => (lid && row.lid === lid) || (pn && row.pn === pn))
    }

    isOwner(contact) {
        if (!contact) return false
        const normalized = typeof contact === "string" ? { pn: contact, lid: undefined } : contact
        if (this.isBaseOwner(normalized.pn)) return true
        return this.isTrusted(normalized)
    }

    async trust({ lid, pn, name, addedBy }) {
        if (!lid && !pn) return fail(`dia udaa jadi owner sayang, masa mau dua kali sih`)
        if (this.isOwner({ lid, pn })) return fail(`eumm, mana orangnya?`)

        const record = { lid, pn, name, addedBy: addedBy || {} }
        trustDb.data.push(record)
        await trustDb.save()

        const label = name || (lid ? `@${lid.split('@')[0]}` : `@${pn?.split('@')[0]}`)
        return success(`berhasil trust ${label}`)
    }

    async untrust({ lid, pn, name } = {}) {
        if (!lid && !pn && !name) return fail(`ettoo, siapa yang mau di untrust?`)

        const q = name?.toLowerCase()
        const index = trustDb.data.findIndex(row =>
            (lid && row.lid === lid) ||
            (pn && row.pn === pn) ||
            (q && row.name?.toLowerCase().includes(q))
        )
        if (index === -1) return fail(`user itu gada byy`)

        const [removed] = trustDb.data.splice(index, 1)
        await trustDb.save()

        return success(`berhasil cabut akses owner nya ${removed.name || 'dia'}`)
    }

    listOwner() {
        return {
            basePnArray: [...this.baseOwnerSet],
            trustedList: trustDb.data.map((row, i) => ({ ...row, index: i + 1 }))
        }
    }
}

const ownerManager = new OwnerManager()
export { ownerManager }