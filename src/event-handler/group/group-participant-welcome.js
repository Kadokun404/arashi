import { groupWelcomeManager } from "#manager/group-welcome-manager.js"
import { groupMetadataStore } from "#store/group-metadata-store.js"
import { contactStore } from "#store/contact-store.js"
import { generateWelcomeCard, generateGoodbyeCard } from "#helper/canvas/welcomecard.js"

/**
 * download buffer dari url, dipake buat ambil background custom & avatar member.
 * return undefined kalau gagal (caller tetep jalan, card generator udah ada fallback)
 * @param {string|undefined} url
 * @returns {Promise<Buffer|undefined>}
 */
async function downloadUrl(url) {
    if (!url) return undefined
    try {
        const res = await fetch(url)
        if (!res.ok) return undefined
        return Buffer.from(await res.arrayBuffer())
    } catch (e) {
        console.warn(`[group-participant-welcome] gagal download ${url}`, e.message)
        return undefined
    }
}

/**
 * Normalisasi participant dari event Baileys (bisa string JID atau object Contact/GroupParticipant)
 * @param {string | object} p
 * @returns {{ id: string, lid?: string, pn?: string, mentionJid: string, name?: string } | null}
 */
function normalizeParticipant(p) {
    if (!p) return null
    if (typeof p === "string") {
        const isLid = p.endsWith("@lid")
        const isPn = p.endsWith("@s.whatsapp.net")
        const lid = isLid ? p : undefined
        const pn = isPn ? p : (!isLid && !p.includes("@") ? `${p}@s.whatsapp.net` : undefined)
        return {
            id: p,
            lid,
            pn,
            mentionJid: pn || lid || p
        }
    }
    if (typeof p === "object") {
        let rawId = p.id || p.jid || p.lid || p.phoneNumber || p.pn || ""
        if (typeof rawId !== "string") rawId = String(rawId || "")

        let lid = typeof p.lid === "string" ? p.lid : (rawId.endsWith("@lid") ? rawId : undefined)
        let pn = typeof p.phoneNumber === "string" ? p.phoneNumber : (typeof p.pn === "string" ? p.pn : undefined)
        if (!pn && rawId.endsWith("@s.whatsapp.net")) {
            pn = rawId
        }
        if (pn && !pn.includes("@")) {
            pn = `${pn}@s.whatsapp.net`
        }

        const id = rawId || pn || lid || ""
        const mentionJid = pn || lid || id
        const name = p.name || p.notify || p.pushName || undefined

        return { id, lid, pn, mentionJid, name }
    }
    return null
}

/**
 * handler buat event NATIVE baileys `group-participants.update`. ini beda sama
 * mekanisme messageStubType based tracking yang udah ada di src/store/store.js
 * (itu khusus buat update db/cache internal group-metadata-store), handler ini
 * khusus buat fitur welcome/goodbye card, gak nyentuh logic yang lama sama sekali.
 * @param {import("baileys").BaileysEventMap['group-participants.update']} update
 * @param {import("baileys").WASocket} sock
 */
async function handlerGroupParticipantsUpdate(update, sock) {
    const { id: groupJid, participants, action } = update
    if (!groupJid || !participants?.length) return

    // add/remove = welcome/goodbye card (pake canvas). promote/demote = notif teks
    // simpel doang (gak pake canvas, ala Karina), di-handle terpisah di bawah
    if (action === "promote" || action === "demote") {
        return handlePromoteDemote(groupJid, participants, action, sock)
    }

    if (action !== "add" && action !== "remove") return

    const settings = action === "add"
        ? groupWelcomeManager.getWelcomeSettings(groupJid)
        : groupWelcomeManager.getGoodbyeSettings(groupJid)
    if (!settings?.enabled) return

    let groupName = groupJid
    let memberCount = participants.length
    try {
        const metadata = await groupMetadataStore.getGroupMetadata(groupJid, sock)
        groupName = metadata?.subject || groupJid
        memberCount = metadata?.participants?.length ?? memberCount
    } catch (e) {
        console.warn(`[group-participant-welcome] gagal ambil metadata grup ${groupJid}`, e.message)
    }

    const backgroundBuffer = await downloadUrl(settings.background)

    for (const rawParticipant of participants) {
        const info = normalizeParticipant(rawParticipant)
        if (!info) continue

        try {
            let contact
            if (info.lid) {
                contact = contactStore.getByLid(info.lid)
            }
            if (!contact && info.pn) {
                contact = contactStore.getByPn(info.pn)
            }
            if (!contact && info.id) {
                contact = contactStore.resolve(info.id)
            }

            if (!contact && info.lid) {
                try {
                    contact = contactStore.upsertAndGet({ lid: info.lid, pn: info.pn, name: info.name })
                } catch (e) {
                    console.warn(`[group-participant-welcome] contact upsert skipped:`, e.message)
                }
            }

            const name = contact?.name || info.name || (info.pn ? info.pn.split("@")[0] : (info.lid ? info.lid.split("@")[0] : info.id.split("@")[0])) || "member"

            let avatarBuffer
            const ppTargets = [info.pn, info.lid, info.id].filter(Boolean)
            for (const target of ppTargets) {
                try {
                    const ppUrl = await sock.profilePictureUrl(target, "image")
                    if (ppUrl) {
                        avatarBuffer = await downloadUrl(ppUrl)
                        if (avatarBuffer) break
                    }
                } catch {
                    // wajar kalau gagal (pp di privasi / gak ada pp), biarin fallback avatar default di canvas
                }
            }

            const cardData = { name, groupName, memberCount, avatarBuffer, backgroundBuffer }
            const placeholderData = {
                name,
                group: groupName,
                count: memberCount,
                lid: info.lid || info.mentionJid,
                pn: info.pn,
                mentionJid: info.mentionJid
            }

            const mentions = Array.from(new Set(
                [info.mentionJid, info.pn, info.lid, info.id].filter(j => typeof j === "string" && j.includes("@"))
            ))

            if (action === "add") {
                const text = groupWelcomeManager.buildWelcomeText(groupJid, placeholderData)
                if (!text) continue
                const image = await generateWelcomeCard(cardData)
                const sent = await sock.sendMessage(groupJid, { image, caption: text, mentions })

                // auto-delete ala Karina, default 30 detik nyala (di set lewat
                // setwelcome autodelete <detik|off>), 0 = gak di hapus
                const autoDeleteSeconds = groupWelcomeManager.getWelcomeAutoDeleteSeconds(groupJid)
                if (sent?.key && autoDeleteSeconds > 0) {
                    setTimeout(() => {
                        sock.sendMessage(groupJid, { delete: sent.key }).catch(() => {})
                    }, autoDeleteSeconds * 1000)
                }
            } else {
                const text = groupWelcomeManager.buildGoodbyeText(groupJid, placeholderData)
                if (!text) continue
                const image = await generateGoodbyeCard(cardData)
                await sock.sendMessage(groupJid, { image, caption: text, mentions })
            }
        } catch (e) {
            console.error(`[group-participant-welcome] gagal proses participant ${JSON.stringify(rawParticipant)} di grup ${groupJid}`, e)
        }
    }
}

/**
 * notif promote/demote, teks doang (gak pake canvas card kayak welcome/goodbye),
 * port dari Karina. off by default per grup, di aktifin lewat setpromote/setdemote
 * @param {string} groupJid
 * @param {Array<string|object>} participants array participant yang kena promote/demote
 * @param {"promote"|"demote"} action
 * @param {import("baileys").WASocket} sock
 */
async function handlePromoteDemote(groupJid, participants, action, sock) {
    const settings = action === "promote"
        ? groupWelcomeManager.getPromoteSettings(groupJid)
        : groupWelcomeManager.getDemoteSettings(groupJid)
    if (!settings?.enabled) return

    let groupName = groupJid
    let memberCount = participants.length
    try {
        const metadata = await groupMetadataStore.getGroupMetadata(groupJid, sock)
        groupName = metadata?.subject || groupJid
        memberCount = metadata?.participants?.length ?? memberCount
    } catch (e) {
        console.warn(`[group-participant-welcome] gagal ambil metadata grup ${groupJid}`, e.message)
    }

    for (const rawParticipant of participants) {
        const info = normalizeParticipant(rawParticipant)
        if (!info) continue

        try {
            let contact
            if (info.lid) {
                contact = contactStore.getByLid(info.lid)
            }
            if (!contact && info.pn) {
                contact = contactStore.getByPn(info.pn)
            }
            if (!contact && info.id) {
                contact = contactStore.resolve(info.id)
            }

            if (!contact && info.lid) {
                try {
                    contact = contactStore.upsertAndGet({ lid: info.lid, pn: info.pn, name: info.name })
                } catch (e) {
                    console.warn(`[group-participant-welcome] contact upsert skipped:`, e.message)
                }
            }

            const name = contact?.name || info.name || (info.pn ? info.pn.split("@")[0] : (info.lid ? info.lid.split("@")[0] : info.id.split("@")[0])) || "member"
            const placeholderData = {
                name,
                group: groupName,
                count: memberCount,
                lid: info.lid || info.mentionJid,
                pn: info.pn,
                mentionJid: info.mentionJid
            }

            const mentions = Array.from(new Set(
                [info.mentionJid, info.pn, info.lid, info.id].filter(j => typeof j === "string" && j.includes("@"))
            ))

            const text = action === "promote"
                ? groupWelcomeManager.buildPromoteText(groupJid, placeholderData)
                : groupWelcomeManager.buildDemoteText(groupJid, placeholderData)
            if (!text) continue

            await sock.sendMessage(groupJid, { text, mentions })
        } catch (e) {
            console.error(`[group-participant-welcome] gagal proses ${action} ${JSON.stringify(rawParticipant)} di grup ${groupJid}`, e)
        }
    }
}

export { handlerGroupParticipantsUpdate }
