/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { InteractiveMessage } from "#helper/interactive-message.js"

const MJ_REGEX = /https?:\/\/mod\.jall\.my\.id\/[^\s]+/i
const TOKEN_REGEX_A = /var\s+token\s*=\s*["']([a-f0-9]{32})["']/i
const TOKEN_REGEX_B = /value=["']([a-f0-9]{32})["']/i
const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

/**
 * @param {string} rawUrl
 * @returns {Promise<{ token: string }>}
 */
async function bypassModJall(rawUrl) {
    /** @type {Record<string, string>} */
    const cookies = {}

    /** @param {Response} res */
    const updateCookies = (res) => {
        const raw = typeof res.headers.getSetCookie === "function"
            ? res.headers.getSetCookie()
            : []
        for (const c of raw) {
            const [pair] = c.split(";")
            const [k, ...v] = pair.split("=")
            if (k) cookies[k.trim()] = v.join("=").trim()
        }
    }

    const getCookies = () =>
        Object.entries(cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join("; ")

    const findToken = (html) =>
        (html.match(TOKEN_REGEX_A) || html.match(TOKEN_REGEX_B))?.[1]

    // step 0: halaman awal
    const res1 = await fetch(rawUrl, { headers: { "User-Agent": UA } })
    updateCookies(res1)
    const html1 = await res1.text()

    const directToken = findToken(html1)
    if (directToken) return { token: directToken }

    const rayId = html1.match(/name="ray_id"\s+value="([^"]+)"/i)?.[1]
    const alias = html1.match(/name="alias"\s+value="([^"]+)"/i)?.[1]
    const formAction =
        html1.match(/action="([^"]+)"/i)?.[1] ||
        "https://app.khaddavi.net/redirect.php"

    if (!rayId || !alias) {
        throw new Error("gagal ambil ray_id/alias dari halaman token")
    }

    const gatewayOrigin = new URL(formAction).origin
    const gateRef = `${formAction}?ray_id=${encodeURIComponent(rayId)}&alias=${encodeURIComponent(alias)}`

    // step 1: redirect gateway
    const res2 = await fetch(gateRef, {
        headers: {
            "User-Agent": UA,
            "Referer": rawUrl,
            "Cookie": getCookies()
        },
        redirect: "manual"
    })
    updateCookies(res2)

    let loc1 = res2.headers.get("location") || ""
    if (!loc1) throw new Error("gagal dapat lokasi artikel step 1")
    if (loc1.startsWith("/")) loc1 = gatewayOrigin + loc1

    const res3 = await fetch(loc1, {
        method: "HEAD",
        headers: {
            "User-Agent": UA,
            "Referer": gateRef,
            "Cookie": getCookies()
        }
    })
    updateCookies(res3)

    // step 2: verify
    const resVerify = await fetch(`${gatewayOrigin}/api/verify`, {
        method: "POST",
        headers: {
            "User-Agent": UA,
            "Referer": loc1,
            "Origin": gatewayOrigin,
            "Content-Type": "application/json",
            "X-XSRF-TOKEN": decodeURIComponent(cookies["XSRF-TOKEN"] || ""),
            "Cookie": getCookies()
        },
        body: JSON.stringify({ _a: 0, captcha: null })
    })
    updateCookies(resVerify)

    const verifyData = await resVerify.json()
    const step2Target = verifyData?.target
    if (!step2Target) {
        throw new Error(`api verify gagal: ${JSON.stringify(verifyData)}`)
    }

    const resStep2 = await fetch(step2Target, {
        headers: {
            "User-Agent": UA,
            "Referer": loc1,
            "Cookie": getCookies()
        },
        redirect: "manual"
    })
    updateCookies(resStep2)

    let loc2 = resStep2.headers.get("location") || ""
    if (!loc2) throw new Error("gagal dapat lokasi artikel step 2")
    if (loc2.startsWith("/")) loc2 = gatewayOrigin + loc2

    const resArticle2 = await fetch(loc2, {
        method: "HEAD",
        headers: {
            "User-Agent": UA,
            "Referer": step2Target,
            "Cookie": getCookies()
        }
    })
    updateCookies(resArticle2)

    // step 3: go
    const key = Math.floor(Math.random() * 1000)
    const size = `${(1366 + key) * 2}.${(768 + key) * 2}`

    const resGo = await fetch(`${gatewayOrigin}/api/go`, {
        method: "POST",
        headers: {
            "User-Agent": UA,
            "Referer": loc2,
            "Origin": gatewayOrigin,
            "Content-Type": "application/json",
            "X-XSRF-TOKEN": decodeURIComponent(cookies["XSRF-TOKEN"] || ""),
            "Cookie": getCookies()
        },
        body: JSON.stringify({ key, size })
    })
    updateCookies(resGo)

    const goData = await resGo.json()
    const shortlinkUrl = goData?.url
    if (!shortlinkUrl) {
        throw new Error(`api go gagal: ${JSON.stringify(goData)}`)
    }

    const resShortlink = await fetch(shortlinkUrl, {
        headers: {
            "User-Agent": UA,
            "Referer": loc2,
            "Cookie": getCookies()
        }
    })
    const htmlShortlink = await resShortlink.text()

    let destinationUrl = ""
    const matchHref = htmlShortlink.match(/window\.location\.href\s*=\s*"([^"]+)"/i)
    if (matchHref) {
        destinationUrl = matchHref[1]
            .replace(/\\([\/"])/g, "$1")
            .replace(/\\u0026/g, "&")
    } else {
        destinationUrl = resShortlink.headers.get("location") || shortlinkUrl
    }

    // step 4: ambil token final
    const resFinal = await fetch(destinationUrl, {
        headers: { "User-Agent": UA }
    })
    const finalToken = findToken(await resFinal.text())

    if (!finalToken) throw new Error("token tidak ditemukan")

    return { token: finalToken }
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, sock, jid, q, text, command, prefix } = ctx

    const input = text || q?.text || ""
    const url = input.match(MJ_REGEX)?.[0]

    if (!url) {
        return m.arashirep(
            `# cara penggunaan\n\n` +
            `> masukin url mod.jall.my.id atau reply pesan yang ada url-nya\n\n` +
            `# contoh\n` +
            `> ${prefix ?? ""}${command} https://mod.jall.my.id/token?data=...`
        )
    }

    await m.react("⏳")

    const started = Date.now()

    try {
        const { token } = await bypassModJall(url)
        const took = Date.now() - started

        const body =
            `result..\n\n` +
            `token:\n${token}\n\n` +
            `took me at: ${took}ms\n` +
            `original url:\n${url}`

        const im = new InteractiveMessage(sock)

        im.setTitle("bypass modjall")
            .setBody(body)
            .setFooter("kadokun")
            .addButtonCopy("copy token", token)

        await im.sendTo(jid)
        await m.react("✅")
    } catch (err) {
        await m.react("❌")
        return m.arashirep(`❌ gagal bypass\n\n${err?.message || "error"}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "modjall bypass",
    commands: ["mj", "modjall"],
    categories: ["tools"],
    description: "bypass mod.jall.my.id dan ambil token"
}

plugin.meta = {
    filename: "modjall.js",
    version: "1.0",
    author: "Kadokun",
    path: "tools",
    note: "url dari teks atau reply pesan"
}

export default plugin