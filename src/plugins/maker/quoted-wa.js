//MODIFIED

/**
 * @import {PluginCtx, Plugin} "../types/types.js"
 */

import { jidDecode, downloadContentFromMessage } from "baileys"
import { Stream } from "node:stream"
import { config } from "#root/config.js"

/**
 * @returns {string} format kaya jam 13.10
 */
const getNowTime = () => {
    return Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Makassar"
    }).format(Date.now())
}

/**
 * Helper untuk mendapatkan nomor asli (bukan lid)
 */
const resolveJid = (jid, contactStore) => {
    if (!jid) return "";
    if (jid.includes('@lid')) {
        const contact = contactStore.getByLid(jid) || contactStore.upsertAndGet({ lid: jid });
        return contact?.pn || jid;
    }
    return jid;
}

/**
 * 
 * @param {PluginCtx} ctx 
 * @returns 
 */
async function run(ctx) {
    const { m, q, contactStore, sock, jid } = ctx

    if (!q) return await m.arashirep('reply ke pesan orang')

    // --- 1. DATA PESAN UTAMA (q) ---
    // Atasi masalah LID
    const rawSenderJid = q?.contact?.pn || q?.contact?.lid || q?.sender || q?.key?.participant || "";
    const resolvedSenderJid = resolveJid(rawSenderJid, contactStore);
    
    const senderName = "~ " + (q?.contact?.name || q?.pushName || q?.name || 'anonim')
    const senderNumber = resolvedSenderJid.includes('@lid') ? resolvedSenderJid.split('@')[0] : (jidDecode(resolvedSenderJid)?.user || '')
    
    // Ambil PP
    const senderAvatar = await sock.profilePictureUrl(resolvedSenderJid, 'image').catch(() => "")

    // Mention Handler
    const mentionedJids = q?.message?.[q?.content]?.contextInfo?.mentionedJid || q?.fullMessage?.message?.[q?.content]?.contextInfo?.mentionedJid || []
    const mentionedContacts = mentionedJids.map(lid => contactStore.upsertAndGet({ lid }))
    const mentionedPushNames = mentionedContacts.map(contact => {
        const mention = "@" + jidDecode(contact.lid).user
        const name = contact?.name || 'anonim'
        return { mention, name }
    })

    let parsedText = q?.text || ""
    mentionedPushNames.forEach(v => {
        parsedText = parsedText.replaceAll(v.mention, "[@" + v.name + "]")
    })

    try {
        let imageb64 = ""
        let hasImage = false

        // Download image dari pesan utama (q)
        if (q.content === "imageMessage" || q.content === "extendedTextMessage") {
            try {
                if (typeof q.download === 'function') {
                    const imageBuffer = await q.download("buffer")
                    imageb64 = imageBuffer.toString("base64")
                    hasImage = true
                }
                
                if (q.content === "extendedTextMessage") {
                    const extMsg = q.message?.extendedTextMessage || q.fullMessage?.message?.extendedTextMessage
                    if (extMsg?.title) {
                        const title = `*${(extMsg.title ?? '').trim()}*`
                        const description = `> ${(extMsg.description ?? '').trim()}`
                        const text = (q.text.replace(extMsg.matchedText,'') ?? '').trim()
                        parsedText = `${title}\n${description}\n\n${text}`.trim()
                    }
                }
            } catch (_) {}
        }

        if (!hasImage && !parsedText) return await m.arashirep(`reply ke pesan yang isi teks atau gambar`)

        // --- 2. DATA PESAN YANG DI-QUOTE (MANUAL EXTRACT) ---
        let quotedPayload = undefined
        
        const contextInfo = q?.fullMessage?.message?.extendedTextMessage?.contextInfo 
                         || q?.message?.extendedTextMessage?.contextInfo 
                         || q?.fullMessage?.message?.imageMessage?.contextInfo 
                         || q?.message?.imageMessage?.contextInfo;

        if (contextInfo && contextInfo.quotedMessage) {
            const qMsg = contextInfo.quotedMessage;
            const rawQqJid = contextInfo.participant;
            
            // Atasi masalah LID pada quote
            const resolvedQqJid = resolveJid(rawQqJid, contactStore);
            const qqNumber = resolvedQqJid.includes('@lid') ? resolvedQqJid.split('@')[0] : (jidDecode(resolvedQqJid)?.user || "");
            
            // Ambil PP Quote
            const qqAvatar = await sock.profilePictureUrl(resolvedQqJid, 'image').catch(() => "");

            // Format Nama
            let qqName = "~ anonim";
            if (rawQqJid) {
                const qqContact = contactStore.upsertAndGet({ lid: rawQqJid })
                qqName = "~ " + (qqContact?.name || qqContact?.pushName || qqNumber || "anonim")
            }

            // Ekstrak Teks & Gambar Quote
            let qqText = qMsg.conversation || qMsg.extendedTextMessage?.text || qMsg.imageMessage?.caption || "";
            let qqImageb64 = "";

            if (qMsg.imageMessage) {
                try {
                    const stream = await downloadContentFromMessage(qMsg.imageMessage, 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    qqImageb64 = buffer.toString('base64');
                } catch (e) {
                    if (!qqText) qqText = "📷 Photo";
                }
            }

            quotedPayload = {
                "name": qqName,
                "number": qqNumber || "",
                "avatar": qqAvatar,
                "message": qqText || (qqImageb64 ? "📷 Photo" : "media"),
                "image": qqImageb64
            }
        }

        // --- 3. MENYUSUN PAYLOAD API ---
        const payload = {
            "sender_name": senderName,
            "sender_number": senderNumber,
            "sender_avatar": senderAvatar,
            "sender_image": imageb64,
            "message": parsedText,
            "time": getNowTime(),
            "background": true
        }

        if (quotedPayload) {
            payload.quoted = quotedPayload
        }

        // --- 4. API CALL & KIRIM PESAN ---
        const res = await fetch('https://qwa.eeq.my.id/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw Error(`${res.status} ${res.statusText}\n` + await res.text())

        const stream = Stream.Readable.fromWeb(res.body)

        return await sock.sendMessage(jid, {
            image: { stream }
        }, {
            quoted: m
        })
    } catch (e) {
        return await m.arashirep(`❌ gagal menghubungi api\n` + e.message)
    }
}

/**@type {Plugin} */
const plugin = { run }

plugin.name = "quoted wa"
plugin.commands = ["qwa"]
plugin.categories = ["maker"]
plugin.description = "bikin quoted chat wa realistic. cukup reply ke message dan ketik qwa. more about the api https://qwa.eeq.my.id"

plugin.meta = {
    filename: "quoted-wa.js",
    author: config.devName,
    note: "makasih buat ghofar selaku owner api, visit aja web nya bagus.",
    version: "5",
    url: "https://qwa.eeq.my.id",
    path: "maker"
}

plugin.config = {
    removeFirstUrl: true,
}

export default plugin