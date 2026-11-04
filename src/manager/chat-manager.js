import { isJidGroup } from "baileys"
import { allPaths } from "#core/all-paths.js"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

/**
 * @typedef {object} ChatActionResponse
 * @property {boolean} ok
 * @property {string} message
 */

/**@param {string} message @returns {ChatActionResponse} */
const fail = (message) => ({ ok: false, message })

/**@param {string} message @returns {ChatActionResponse} */
const success = (message) => ({ ok: true, message })

const CONFIG_PATH = allPaths.chatManagerConfig

class GroupListenMode {
    static SELF = 0
    static PUBLIC = 1
    static DEFAULT = 2
}

class PrivateListenMode {
    static SELF = 0
    static PUBLIC = 1
}

// default nya di bikin group "default" (whitelist) & private "self" biar aman
// pas data/ kosong atau bot pertama kali jalan. owner tetep bisa pindah mode
// kapanpun lewat command "chat".
const getDefaultConfig = () => ({
    groupMode: GroupListenMode.DEFAULT,
    privateMode: PrivateListenMode.SELF,
    groupsWhitelist: {}
})

/**
 * chat manager: hasil porting dari project kadomatcha (versi paling lengkap),
 * ngatur bot listen atau kagak di suatu chat. di pisah jadi 2 jenis chat:
 * *private* dan *group*.
 *
 * - private punya 2 mode: self (cuma owner/trusted), public (siapapun)
 * - group punya 3 mode: self (cuma owner/trusted di SEMUA grup),
 *   public (siapapun di SEMUA grup), default (ngikutin whitelist per-grup,
 *   di atur pake "chat on" / "chat off", owner/trusted tetep selalu boleh)
 *
 * mode self & public di grup itu meng-override whitelist, tapi whitelist nya
 * tetap kesimpen (jadi kalau balik lagi ke mode default, setting per-grup
 * yang lama masih dipake).
 *
 * beda sama chat-manager fauna yang lama (cuma on/off polos per jid), disini
 * konsep "owner/trusted selalu boleh" ikut di pertimbangkan lewat parameter
 * isOwner di isAllowed(), biar owner gak pernah ke block sendiri walau lagi
 * iseng set mode self di semua grup.
 */
class ChatManager {
    groupMode = GroupListenMode.DEFAULT
    privateMode = PrivateListenMode.SELF

    /** @type {Map<string, string|null>} jid grup -> note (biasanya nama grup) */
    groupsWhitelist = new Map()

    /**
     * @param {string} jid
     * @returns {boolean}
     */
    isGroupJid(jid) {
        return typeof jid === "string" && isJidGroup(jid)
    }

    /**
     * cek apakah bot boleh proses chat ini, sesuai mode yang lagi aktif.
     * @param {string} jid
     * @param {boolean} [isOwner] apakah pengirim owner/trusted (dari ownerManager.isOwner)
     * @returns {boolean}
     */
    isAllowed(jid, isOwner = false) {
        if (!jid) return true

        if (this.isGroupJid(jid)) {
            if (this.groupMode === GroupListenMode.SELF) return isOwner
            if (this.groupMode === GroupListenMode.DEFAULT) return isOwner || this.groupsWhitelist.has(jid)
            return true // PUBLIC
        }

        if (this.privateMode === PrivateListenMode.SELF) return isOwner
        return true // PUBLIC
    }

    /**
     * @param {string} jid
     */
    getStatus(jid) {
        return {
            groupMode: this.groupMode,
            privateMode: this.privateMode,
            listen: this.groupsWhitelist.has(jid)
        }
    }

    /**
     * @param {number} mode salah satu dari GroupListenMode
     * @returns {Promise<boolean>} true kalau beneran berubah
     */
    async groupChatToggle(mode) {
        if (this.groupMode === mode) return false
        this.groupMode = mode
        await this.#save()
        return true
    }

    /**
     * @param {number} mode salah satu dari PrivateListenMode
     * @returns {Promise<boolean>} true kalau beneran berubah
     */
    async privateChatToggle(mode) {
        if (this.privateMode === mode) return false
        this.privateMode = mode
        await this.#save()
        return true
    }

    /**
     * atur whitelist per-grup, cuma relevant kalau groupMode = DEFAULT
     * @param {"add"|"remove"} action
     * @param {string} jid jid grup
     * @param {string|null} [note] biasanya nama grup, cuma dipake pas action "add"
     * @returns {Promise<boolean>} true kalau beneran berubah
     */
    async manageGroupsWhitelist(action, jid, note = null) {
        if (action === "add") {
            if (this.groupsWhitelist.has(jid)) return false
            this.groupsWhitelist.set(jid, note)
            await this.#save()
            return true
        }

        if (action === "remove") {
            if (!this.groupsWhitelist.has(jid)) return false
            this.groupsWhitelist.delete(jid)
            await this.#save()
            return true
        }

        throw new Error(`param "action" gak valid, cuma nerima "add"/"remove"`)
    }

    async #save() {
        const data = {
            groupMode: this.groupMode,
            privateMode: this.privateMode,
            groupsWhitelist: Object.fromEntries(this.groupsWhitelist)
        }
        await mkdir(dirname(CONFIG_PATH), { recursive: true })
        await writeFile(CONFIG_PATH, JSON.stringify(data, null, 2))
    }

    /**
     * load config dari disk. kalau file belum ada / corrupt / masih format lama
     * (array bekas chat-manager versi sebelumnya) maka fallback ke default dan
     * langsung di normalisasi/simpan ulang ke format baru.
     */
    async load() {
        const fallback = getDefaultConfig()
        try {
            const raw = await readFile(CONFIG_PATH, "utf-8")
            const parsed = JSON.parse(raw)

            const isValidShape = parsed && typeof parsed === "object" && !Array.isArray(parsed)
            if (!isValidShape) throw new Error("format config lama/gak valid (bukan object)")

            this.groupMode = typeof parsed.groupMode === "number" ? parsed.groupMode : fallback.groupMode
            this.privateMode = typeof parsed.privateMode === "number" ? parsed.privateMode : fallback.privateMode

            const whitelistObj = parsed.groupsWhitelist && typeof parsed.groupsWhitelist === "object" && !Array.isArray(parsed.groupsWhitelist)
                ? parsed.groupsWhitelist
                : fallback.groupsWhitelist
            this.groupsWhitelist = new Map(Object.entries(whitelistObj))
        } catch (e) {
            console.warn(`[chat-manager] gagal load config (${e.message}), pakai default & simpan ulang`)
            this.groupMode = fallback.groupMode
            this.privateMode = fallback.privateMode
            this.groupsWhitelist = new Map()
            await this.#save()
        }
    }
}

const chatManager = new ChatManager()
await chatManager.load()

export { chatManager, GroupListenMode, PrivateListenMode }
