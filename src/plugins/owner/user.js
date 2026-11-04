import { ownerManager } from "#manager/owner-manager.js"
import { resolveTarget } from "#helper/resolve-target.js"
import { config } from "#root/config.js"

const HELP_TEXT = `haloo sayangg, aku bakal jelasin gimana caranya pakai fitur ini, ada 3 opsi yang bisa kamu mainin:\n` +
`user trust [ reply pesan user atau tag, opsional kamu bisa kasih dia nama, contoh user trust Kadokun ]\n` +
`user untrust [ gausa di jelasin yaa? :3 ]\n` +
` user view [ liat user user yang di trust dan developer nya ]`

async function replyWithMention(ctx, text, mentions) {
    const { sock, m, jid } = ctx
    return await sock.sendMessage(jid, { text, mentions }, { quoted: m })
}

async function runTrust(ctx) {
    const { m } = ctx
    const target = resolveTarget(ctx)
    if (!target.lid && !target.pn) return await m.arashirep(`hm, kamu mau trust siapa byy?`)
    if (!target.lid) return await m.arashirep(`hmm belum ketauan lid nya (belum pernah kedetect kontak nya). coba reply pesan orangnya langsung ya`)

    const authorContact = m.contact
    const result = await ownerManager.trust({
        lid: target.lid,
        pn: target.pn,
        name: target.argument || target.name,
        addedBy: { lid: authorContact?.lid, pn: authorContact?.pn }
    })

    return await m.arashirep(result.message)
}

async function runUntrust(ctx) {
    const { m } = ctx
    const target = resolveTarget(ctx)
    const name = target.name || target.argument

    if (!target.lid && !target.pn && !name) return await m.arashirep(`lohh lohh, mau untrust siapa?`)

    const result = await ownerManager.untrust({ lid: target.lid, pn: target.pn, name })
    return await m.arashirep(result.message)
}

async function runView(ctx) {
    const { m } = ctx
    const { basePnArray, trustedList } = ownerManager.listOwner()

    const baseText = basePnArray.length
        ? basePnArray.map(pn => `- @${pn.split('@')[0]}`).join('\n')
        : 'nda ada'

    const trustedText = trustedList.length
        ? trustedList.map(row => {
            const label = row.lid ? `@${row.lid.split('@')[0]}` : `@${row.pn?.split('@')[0]}`
            const name = row.name ? ` — ${row.name}` : ''
            return `${row.index}. ${label} [ ${name} ]`
        }).join('\n')
        : 'belum ada'

    const mentions = [...basePnArray, ...trustedList.map(row => row.lid).filter(Boolean)]
    const text = `ini suami suami ku:\n${baseText}\nkalo ini juspren :3:\n${trustedText}`
    return await replyWithMention(ctx, text, mentions)
}

async function run(ctx) {
    if (!ctx.isOwner) return
    const { text, m } = ctx

    const trimmed = (text || '').trim()
    const subcommand = trimmed.split(/\s+/)[0]?.toLowerCase()
    const rest = trimmed.slice(subcommand?.length || 0).trim()
    const subCtx = { ...ctx, text: rest }

    if (subcommand === "trust") return await runTrust(subCtx)
    if (subcommand === "untrust" || subcommand === "remove" || subcommand === "delete") return await runUntrust(subCtx)
    if (subcommand === "view") return await runView(subCtx)
    if (subcommand === "-h" || subcommand === "help" || !subcommand) return await m.arashirep(HELP_TEXT)

    return await m.arashirep(`${subcommand} gak dikenali\n\n${HELP_TEXT}`)
}

const plugin = {
    run,
    name: "user manager",
    commands: ["user"],
    categories: ["owner"],
    description: `adalah plugin buat ngatur trust level (akses setara owner)\n\n${HELP_TEXT}`
}

plugin.meta = {
    filename: "user.js",
    author: config.devName,
    note: "subcommand: trust/untrust(remove)/view, semua lewat resolveTarget (reply/tag/nama)",
    version: "1",
    path: "owner"
}

plugin.config = { protected: true }

export default plugin