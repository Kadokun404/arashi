async function run(ctx) {
    const { m, q, text, command } = ctx
    const prefix = ctx.prefix || "."

    await m.react("⏳")

    try {
        let input = (text || (q && q.text) || "").trim()
        if (!input) {
            await m.react("❌")
            return await m.arashirep(`Enter an IP address or a URL/domain.\n\nExample:\n${prefix}${command} 8.8.8.8\n${prefix}${command} https://google.com`)
        }

        let cleaned = input.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].split("?")[0].split(":")[0].trim().toLowerCase()
        const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(cleaned)

        let hasil = ""

        if (isIP) {
            hasil = formatIPInfo(await getIPInfo(cleaned))
        } else {
            const domain = cleaned
            hasil += `Target: ${domain}\n\nMain Domain\n${formatIPInfo(await getIPInfo(domain))}\n\n`

            const subdomains = await getSubdomains(domain)
            if (subdomains.length > 0) {
                hasil += `Subdomains (${subdomains.length})\n`
                const limit = 15
                for (const sub of subdomains.slice(0, limit)) {
                    try {
                        const info = await getIPInfo(sub)
                        hasil += info.status === "success"
                            ? `\n${sub}\n  IP: ${info.query}\n  Location: ${info.city || "-"}, ${info.country || "-"}\n  ISP: ${info.isp || "-"}`
                            : `\n${sub}\n  Resolve failed`
                    } catch {
                        hasil += `\n${sub}\n  Resolve failed`
                    }
                }
                if (subdomains.length > limit) hasil += `\n\n...and ${subdomains.length - limit} more subdomains`
            } else {
                hasil += `Subdomains\nNo other subdomains found.`
            }
        }

        await m.arashirep(hasil.trim())
        await m.react("✅")
    } catch (error) {
        console.error(`[Error - ${command}]:`, error)
        await m.react("❌")
        await m.arashirep(`Error:\n${error.message}`)
    }
}

async function getIPInfo(target) {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(target)}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query`)
    if (!res.ok) throw new Error(`API error ${res.status}`)
    return await res.json()
}

function formatIPInfo(data) {
    if (!data || data.status !== "success") return `Failed to fetch data (${(data && data.message) || "unknown"})`
    return `IP: ${data.query}
Country: ${data.country || "-"} (${data.countryCode || "-"})
City: ${data.city || "-"}, ${data.regionName || "-"}
ZIP: ${data.zip || "-"}
Coordinates: ${data.lat}, ${data.lon}
Timezone: ${data.timezone || "-"}
ISP: ${data.isp || "-"}
Org: ${data.org || "-"}
AS: ${data.as || "-"}`
}

async function getSubdomains(domain) {
    try {
        const res = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`)
        if (!res.ok) return []
        const data = await res.json()
        if (!Array.isArray(data)) return []

        const set = new Set()
        for (const entry of data) {
            if (!entry.name_value) continue
            for (let name of entry.name_value.split("\n")) {
                name = name.trim().toLowerCase().replace(/^\*\./, "")
                if (name.endsWith(domain) && !name.includes(" ")) set.add(name)
            }
        }
        return Array.from(set).sort()
    } catch {
        return []
    }
}

const plugin = {
    run,
    name: "ip lookup",
    commands: ["ip"],
    categories: ["tools"],
    description: "Check IP address info or look up a domain/URL along with all its subdomains"
}

plugin.meta = {
    filename: "iplookup.js",
    version: "1.0",
    author: "Kadokun",
    note: "Accepts a direct IP or a URL/domain (https optional), auto-discovers subdomains via crt.sh",
    path: "tools"
}

export default plugin