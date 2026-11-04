import { getFirstStringAndRest } from "#helper/common.js"
import { botNameManager } from "#manager/bot-name-manager.js"

const HELP_TEXT = `haloo sayangg, ini cara kelola nama yang di register ke bot:\n\n` +
    `add [ nama, daftarin nama baru, contoh: name add alice ]\n` +
    `del [ nama, hapus nama yang ke daftar ]\n` +
    `list [ liat semua nama yang ke daftar ]\n\n` +
    `nama yang udah ke daftar bisa kamu lock atau unlock pake command lock/unlock terpisah`

async function run(ctx) {
    const { m, text, isOwner } = ctx

    if (!isOwner) return 
    if (!text) return await m.arashirep(HELP_TEXT)

    const { firstString, restString } = getFirstStringAndRest(text)
    const subcommand = firstString?.toLowerCase()

    if (subcommand === "add") {
        if (!restString) return await m.arashirep(`kasih nama nya dong, contoh: name add alice`)
        const r = botNameManager.add(restString)
        return await m.arashirep(r.message)
    }

    if (subcommand === "del" || subcommand === "delete" || subcommand === "remove") {
        if (!restString) return await m.arashirep(`kasih nama nya dong, contoh: name del alice`)
        const r = botNameManager.remove(restString)
        return await m.arashirep(r.message)
    }

    if (subcommand === "list") {
        const names = botNameManager.list()
        if (!names.length) return await m.arashirep(`belum ada nama yang ke daftar, pakai name add [ nama ] dulu yaa`)
        const lines = names.map(n => `${n} ${botNameManager.isLocked(n) ? "[ locked ]" : "[ unlocked ]"}`)
        return await m.arashirep(`ini daftar nama nya:\n${lines.join("\n")}`)
    }

    return await m.arashirep(HELP_TEXT)
}

const plugin = {
    run,
    name: "name manager",
    commands: ["name"],
    categories: ["owner"],
    description: HELP_TEXT
}

plugin.meta = {
    filename: "name-manager.js",
    version: "1",
    author: "Kado",
    note: "daftar nama di simpen di data/bot-name.json lewat bot-name-manager.js. buat lock/unlock per nama, pakai command lock/unlock (owner/bot-lock.js & bot-unlock.js) -- kalau argumennya cocok sama nama yang ke daftar di sini, bakal ke lock/unlock per-nama (balesnya persis 'Bot Locked.'/'Bot Unlocked.'), kalau enggak cocok fallback ke behaviour lock/unlock global bot yang lama",
    path: "owner"
}

export default plugin