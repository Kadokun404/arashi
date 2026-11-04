/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import crypto from "node:crypto"
import { Interactive } from "#helper/sendInteractive.js"
import {
    LINE,
    formatRp,
    getLevelBadge,
    xpForNextLevel,
    resolveUserIdentity,
    ensureUser,
    getUserFullProfile,
    isKadoUser
} from "#manager/game-manager.js"
import { chatManager } from "#manager/chat-manager.js"
import { ownerManager } from "#manager/owner-manager.js"
import { isGroupAdmin } from "#helper/group-admin.js"

export function generateUserSN(userId) {
    const hash = crypto.createHash("sha256").update(String(userId || "arashi-user")).digest("hex").toUpperCase()
    return `ARA-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, q, jid, command } = ctx

    const isInvMode = command === "inv" || command === "inventory" || command === "tas"

    // Tentukan target: quoted -> mentioned -> sender
    const mentionedJid = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    let targetMsg = m
    if (q && !q.key?.fromMe) {
        targetMsg = q
    } else if (mentionedJid[0]) {
        targetMsg = { sender: mentionedJid[0], name: mentionedJid[0].split("@")[0] }
    }

    const { userId, pn, name } = resolveUserIdentity(targetMsg)
    const isOwnerCheat = isKadoUser(userId, pn)
    const isGroup = chatManager.isGroupJid(jid)

    const prof = getUserFullProfile(userId, isGroup ? jid : null, name, pn)
    const u = prof.user
    const nextXp = isOwnerCheat ? "∞" : xpForNextLevel(u.level)
    const sn = generateUserSN(userId)

    const isTargetOwner = ownerManager.isOwner({ lid: userId, pn })
    const isTargetAdmin = isGroup ? await isGroupAdmin({ sock, m: targetMsg, jid }) : false

    let roleStr = "🌱 Member"
    if (isOwnerCheat) {
        roleStr = "⚡ Creator / Base Owner 👑"
    } else if (isTargetOwner) {
        roleStr = "👑 Trusted Owner"
    } else if (isTargetAdmin) {
        roleStr = "🛡️ Admin Grup"
    }

    // Ambil Foto Profil User
    let ppUrl = null
    try {
        if (pn) {
            ppUrl = await sock.profilePictureUrl(pn, "image").catch(() => null)
        }
        if (!ppUrl && userId) {
            ppUrl = await sock.profilePictureUrl(userId, "image").catch(() => null)
        }
    } catch {}

    // Fallback jika tidak ada PP
    if (!ppUrl) {
        ppUrl = "https://files.catbox.moe/5m9y7a.jpg"
    }

    let groupSection = ""
    if (isGroup && prof.groupMember) {
        const gm = prof.groupMember
        groupSection =
            `\n👥 *STATISTIK GRUP*\n` +
            `• Peringkat : *#${prof.groupRank}*\n` +
            `• Poin Grup : *${gm.points} Poin*\n` +
            `• Menang    : *${gm.wins}x* (Main: ${gm.played}x)\n` +
            `• Hadiah    : *${formatRp(gm.money_won)}*\n`
    }

    let invSection = ""
    if (isInvMode) {
        invSection =
            `\n🎒 *INVENTARIS & ASET*\n` +
            `• 💳 Kartu Bank   : *Arashi Black Diamond Card*\n` +
            `• 🎫 Kupon Kuis   : *${isOwnerCheat ? "∞ Tak Terbatas (Cheat Mode)" : "10x Kupon Harian"}*\n` +
            `• 🏷️ Gelar / Title : *${getLevelBadge(u.level)}*\n` +
            `• 🛡️ Keamanan Aset: *Verified Database SQLite (WAL Mode)*\n`
    }

    const caption =
        `${isInvMode ? "🎒 *INVENTORY PENGGUNA*" : "🪪 *PROFIL PENGGUNA*"}\n${LINE}\n` +
        `👤 *Nama       :* ${u.name}\n` +
        `📱 *Kontak     :* ${pn ? `+${pn.split("@")[0]}` : userId}\n` +
        `🔑 *Serial No. :* \`${sn}\`\n` +
        `👑 *Role / Hak  :* ${roleStr}\n` +
        `${LINE}\n` +
        `⚔️ *STATUS RPG & EKONOMI*\n` +
        `• Pangkat     : *${getLevelBadge(u.level)}* (Lv.${u.level})\n` +
        `• EXP         : *${isOwnerCheat ? "∞ / ∞ XP (Tak Terbatas)" : `${u.xp} / ${nextXp} XP`}*\n` +
        `• Saldo Dompet: *${formatRp(u.money)}*\n` +
        `• Saldo Bank  : *${formatRp(u.bank)}*\n` +
        `• Total Harta : *${formatRp(Number(u.money) + Number(u.bank))}*\n` +
        `• Menang Kuis : *${u.wins}x* (Main: ${u.played}x)\n` +
        `• Win Streak  : *🔥 ${u.streak}x* (Rekor: ${u.best_streak}x)\n` +
        `• Rank Global : *#${prof.globalRank}*` +
        (groupSection ? `${groupSection}` : "\n") +
        (invSection ? `${invSection}` : "") +
        `${LINE}\n` +
        `💡 _Gunakan tombol di bawah untuk menyalin Serial Number (SN)!_`

    try {
        const interactive = new Interactive(sock)
        if (ppUrl) {
            interactive.setHeader({ image: { url: ppUrl } })
        }
        interactive.setBody(caption)
        interactive.setFooter("Arashi Assistant • Google Antigravity")
        interactive.addButtonCopy("📋 Salin SN", sn)

        await interactive.send(jid, { quoted: m })
    } catch (e) {
        console.error("[profile] interactive send error:", e)
        try {
            await sock.sendMessage(jid, {
                image: { url: ppUrl },
                caption
            }, { quoted: m })
        } catch {
            await m.arashirep(caption)
        }
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "user profile & inventory",
    commands: ["me", "profile", "profil", "inv", "inventory", "tas", "sn", "serialnumber"],
    categories: ["main", "fun"],
    description: "Menampilkan profil pengguna, statistik RPG game, saldo ekonomi, inventaris, foto profil, dan tombol salin Serial Number (SN)"
}

plugin.meta = {
    filename: "profile.js",
    version: "1.0.0",
    author: "Kado",
    note: "Menampilkan profil lengkap dengan foto profil WA pengguna, statistik level/XP/saldo, inventaris, dan cta_copy Serial Number",
    path: "main"
}

export default plugin
