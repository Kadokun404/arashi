/**
 * @import {PluginCtx, Plugin} from "../../types/types.js"
 * @typedef {"status" | "s" | "on" | "off" | "add" | "a" | "del" | "d" | "stdl" | "reserved"} userAction
 */

/**
 * @param {PluginCtx} ctx
 * @returns {Promise<void>}
 */
async function run(ctx) {
    const { text, m, prefixManager, pluginManager, isOwner } = ctx
if (!isOwner) return 
    if (!text) return await m.arashirep("haloo sayangg, ini prefix manager, mau ngapain nih?")

    const params = text.split(/\s+/).filter(Boolean)

    /**@type {userAction} */
    const userAction = params[0]
    const userFirstParam = params[1]

    if (userAction === "status" || userAction === "s") {
        const { isPrefixActive, prefixList } = prefixManager.getStatus()

        const statusText = `prefix: ` + (isPrefixActive ? 'on' : 'off')
        const prefixListText = `daftar prefix\n` +
            prefixList.map((v, i) => `${i + 1}. [ ${v} ]`).join("\n")

        return await m.arashirep(`${statusText}\n\n${prefixListText}`)
    }

    if (userAction === "on") {
        const response = await prefixManager.togglePrefixOn()
        return await m.arashirep(response.message)
    }

    if (userAction === "off") {
        const response = await prefixManager.togglePrefixOff()
        return await m.arashirep(response.message)
    }

    if (userAction === "add" || userAction === "a") {
        const response = await prefixManager.addPrefix(userFirstParam)
        return await m.arashirep(response.message)
    }

    if (userAction === "stdl") {
        const response = await prefixManager.setToDefaultPrefixList()
        return await m.arashirep(response.message)
    }

    if (userAction === "del" || userAction === "d") {
        const response = await prefixManager.deletePrefix(userFirstParam)
        return await m.arashirep(response.message)
    }

    if (userAction === "reserved") {
        const header = `ini daftar reserved prefix beserta nama plugin nya, sayang`
        const content = pluginManager.getBypassPluginString()
        const footer = `tolong jangan pakai prefix itu yaa`
        return await m.arashirep(`${header}\n\n${content}\n\n${footer}`)
    }

    return await m.arashirep(`aku gak ngerti maksudnya, coba pake -h yaa`)
}

/**@type {Plugin} */
const plugin = { run }

plugin.name = "prefix manager"
plugin.commands = ["prefix"]
plugin.categories = ["owner"]
plugin.description = `haloo sayangg, ini prefix manager, aku jelasin caranya yaa\n\n` +
    `status [ s, liat status prefix on/off beserta daftar prefix nya ]\n` +
    `on [ nyalain prefix ]\n` +
    `off [ matiin prefix ]\n` +
    `add [ a, tambahin prefix baru, contoh: prefix add ! ]\n` +
    `del [ d, hapus prefix, contoh: prefix del ! ]\n` +
    `stdl [ balikin daftar prefix ke default ]\n` +
    `reserved [ liat prefix yang udah kepake plugin lain, jangan dipake lagi yaa ]`

plugin.meta = {
    filename: "prefix-manager.js",
    author: "kado",
    note: "typo dash di userAction dibenerin (dulu JSDoc nyebut --status dkk tapi kode nya cek tanpa dash)",
    version: "2",
    path: "owner"
}

plugin.config = {
    protected: true,
    bypassPrefix: true,
}

export default plugin