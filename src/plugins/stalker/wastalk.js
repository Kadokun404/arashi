import moment from "moment-timezone"
import PhoneNum from "awesome-phonenumber"
import { contactStore } from "#store/contact-store.js"
import { jidNormalizedUser } from "baileys"

const regionNames = new Intl.DisplayNames(["en"], { type: "region" })

function resolveNumber(ctx) {
    const { m, q, text } = ctx

    if (q?.contact?.pn) return q.contact.pn

    const mentionedJid = m?.message?.[m?.content]?.contextInfo?.mentionedJid
    if (mentionedJid?.length) {
        const contact = contactStore.getByLid(mentionedJid[0])
        if (contact?.pn) return contact.pn
    }

    const numberOnly = (text || "").trim().replace(/\D/g, "")
    if (!numberOnly) return null

    return jidNormalizedUser(`${numberOnly}@s.whatsapp.net`)
}

async function run(ctx) {
    const { m, sock, jid, command } = ctx
    const num = resolveNumber(ctx)

    if (!num) return await m.arashirep(`Usage: ${command} @tag / 628xxx`)

    try {
        const onWa = await sock.onWhatsApp(num)
        if (!onWa || !onWa[0]?.exists) {
            return await m.arashirep("User does not exist on WhatsApp")
        }

        let img = "https://telegra.ph/file/70e8de9b1879568954f09.jpg"
        try { img = await sock.profilePictureUrl(num, "image") } catch {}

        let bio = {}
        try { bio = await sock.fetchStatus(num) } catch {}

        let name = contactStore.getByPn(num)?.name
        if (!name && typeof sock.getName === "function") {
            try { name = await sock.getName(num) } catch {}
        }
        name = name || num.split("@")[0]

        let business = null
        try { business = await sock.getBusinessProfile(num) } catch {}

        let format, country
        try {
            format = PhoneNum(`+${num.split("@")[0]}`)
            country = regionNames.of(format.getRegionCode("mobile"))
        } catch {
            format = null
            country = "Unknown"
        }

        const formattedNumber = format ? format.getNumber("international") : num.split("@")[0]

        let res = `WhatsApp Info\n\n` +
            `Country: ${country ? country.toUpperCase() : "-"}\n` +
            `Name: ${name}\n` +
            `Number: ${formattedNumber}\n` +
            `Url: wa.me/${num.split("@")[0]}\n` +
            `Mention: @${num.split("@")[0]}\n` +
            `Status: ${bio?.status || "-"}\n` +
            `Status Date: ${bio?.setAt ? moment(bio.setAt).tz("Asia/Jakarta").format("LLLL") : "-"}\n\n`

        if (business) {
            res += `Business Info\n\n` +
                `Business ID: ${business.wid}\n` +
                `Website: ${business.website || "-"}\n` +
                `Email: ${business.email || "-"}\n` +
                `Category: ${business.category}\n` +
                `Address: ${business.address || "-"}\n` +
                `Timezone: ${business.business_hours?.timezone || "-"}\n` +
                `Description: ${business.description || "-"}`
        } else {
            res += "Standard WhatsApp Account"
        }

        await sock.sendMessage(jid, {
            image: { url: img },
            caption: res,
            mentions: [num]
        }, { quoted: m })

    } catch (err) {
        console.error("[wastalk]", err)
        await m.arashirep("Failed to stalk user.")
    }
}

const plugin = {
    run,
    name: "wa stalk",
    commands: ["wastalk", "whatsappstalk", "stalkwa"],
    categories: ["stalker"],
    description: "Stalk a WhatsApp profile (reply/tag/number). Usage: wastalk <number/tag>"
}

plugin.meta = {
    filename: "wastalk.js",
    version: "1",
    author: "Kadokun",
    note: "requires npm install moment-timezone awesome-phonenumber",
    path: "stalker"
}

export default plugin