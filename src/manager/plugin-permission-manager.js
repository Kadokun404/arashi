import { unixTimestampSeconds } from "baileys"
import { pluginPermissionStmt } from "#database/table-plugin-permission.js"
import { contactStore } from "#store/contact-store.js"
import { pluginManager } from "./plugin-manager.js"

class PluginPermissionManager {
    permissionMap = new Map()

    constructor() {
        for (const row of pluginPermissionStmt.getAll.iterate()) {
            const { lid, command } = row
            let set = this.permissionMap.get(lid)
            if (set === undefined) {
                this.permissionMap.set(lid, new Set())
                set = this.permissionMap.get(lid)
            }
            set.add(command)
        }
    }

    giveAccess(param) {
        if (!param) return {
            ok: false,
            message: 'invalid param'
        }

        const { participantLid, authorLid, command, timestamp } = param

        const isValidCommand = pluginManager.pluginMap.has(command)
        if (!isValidCommand){
            return {
                ok: false,
                message: `command ${command} tidak ada di daftar command plugin`
            }
        }

        const isCommandDuplicate = this.permissionMap.get(participantLid).has(command)
        if (isCommandDuplicate){
            return {
                ok: false,
                message: `command ${command} sudah ada sebelumnya. nothing changes`
            }
        }

        const now = unixTimestampSeconds()
        const contact = contactStore.upsertAndGet({
            lid: participantLid
        })
        const contactAuthor = contactStore.upsertAndGet({
            lid: authorLid
        })

        const bentrok = this.permissionMap.get(participantLid)?.has(command)
        if (bentrok) {
            return false
        }

        pluginPermissionStmt.insert.run({
            contactId: contact.id,
            givenBy: contactAuthor.id,
            command,
            timestamp: now
        })

        let set = this.permissionMap.get(participantLid)
        if (set === undefined) {
            this.permissionMap.set(participantLid, new Set())
            set = this.permissionMap.get(participantLid)
        }
        set.add(command)

        return {
            ok: true,
            message: `berhasil`
        }
    }
}

const pluginPermissionManager = new PluginPermissionManager()

export { pluginPermissionManager }