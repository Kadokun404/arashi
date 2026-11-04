import { config } from "#root/config.js"
/**
  * @import {PluginCtx, PluginType} from "#types/types.js"
  */

import { InteractiveMessage } from "#helper/interactive-message.js"

const FGSI_API = "https://fgsi.dpdns.org/api/tools/skip/tutwuri"
const FGSI_KEY = "fgsiapi-15221b19-6d"

const THERESAV_API = "https://api.theresav.eu/api/bypass/sfl"
const THERESAV_KEY = config.apikey.theresav

const MAX_LOOP = 1
const SFL_REGEX = /https?:\/\/(?:www\.)?sfl\.gl\/[^\s]+/i

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, sock, jid, q, text, command, prefix } = ctx

    const input = text || q?.text || ""
    const url = input.match(SFL_REGEX)?.[0]

    if (!url) {
        return m.arashirep(
            `# cara penggunaan\n\n` +
            `> masukin url sfl.gl buat di-skip\n\n` +
            `# contoh\n` +
            `> ${prefix ?? ""}${command} https://sfl.gl/...`
        )
    }

    await m.react("⏳")

    const started = Date.now()

    const fgsi = async () => {
        let current = url
        const seen = new Set()

        for (let i = 0; i < MAX_LOOP; i++) {
            if (seen.has(current)) throw new Error("fgsi redirect loop")
            seen.add(current)

            const params = new URLSearchParams({
                url: current,
                apikey: FGSI_KEY
            })

            const res = await fetch(`${FGSI_API}?${params}`, {
                headers: { accept: "application/json" }
            })

            if (!res.ok) {
                throw new Error(`http ${res.status}`)
            }

            const data = await res.json()

            if (!data.status || !data.data?.url) {
                throw new Error(data.message || "gagal bypass")
            }

            current = data.data.url

            if (!SFL_REGEX.test(current)) {
                return current
            }
        }

        throw new Error("maximum redirect tercapai")
    }

    const theresav = async () => {
        const res = await fetch(
            `${THERESAV_API}?url=${encodeURIComponent(url)}`,
            {
                headers: {
                    "x-apikey": THERESAV_KEY
                }
            }
        )

        if (!res.ok) {
            throw new Error(`http ${res.status}`)
        }

        const data = await res.json()

        if (!data.status || !data.bypassed_url) {
            throw new Error("gagal bypass")
        }

        return {
            url: data.bypassed_url,
            time: data.execution_time_ms
        }
    }

    const [fgsiResult, theresavResult] = await Promise.allSettled([
        fgsi(),
        theresav()
    ])

    const fgsiUrl =
        fgsiResult.status === "fulfilled"
            ? fgsiResult.value
            : null

    const theresavUrl =
        theresavResult.status === "fulfilled"
            ? theresavResult.value.url
            : null

    if (!fgsiUrl && !theresavUrl) {
        await m.react("❌")
        return m.arashirep(
            `❌ kedua api gagal\n\n` +
            `fgsi: ${fgsiResult.reason?.message || "error"}\n` +
            `theresav: ${theresavResult.reason?.message || "error"}`
        )
    }

    const took = Date.now() - started

    const body =
        `result..\n\n` +
        `made by theresav:\n${theresavUrl || "gagal"}\n\n` +
        `made by fgsi:\n${fgsiUrl || "gagal"}\n\n` +
        `took me at: ${took}ms\n` +
        `original url:\n${url}`

    const im = new InteractiveMessage(sock)

    im.setTitle("skip sfl.gl")
        .setBody(body)
        .setFooter(
            `${fgsiUrl ? "fgsi restapi" : ""}` +
            `${fgsiUrl && theresavUrl ? " || " : ""}` +
            `${theresavUrl ? "api theresav" : ""}`
        )

    if (fgsiUrl) {
        im.addButtonCopy("copy url fgsi", fgsiUrl)
    }

    if (theresavUrl) {
        im.addButtonCopy("copy url theresav", theresavUrl)
    }

    await im.sendTo(jid)
    await m.react("✅")
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "sfl.gl bypass",
    commands: ["sflgl", "sfl", "skipsfl"],
    categories: ["tools"],
    description: "bypass sfl.gl menggunakan fgsi dan theresav"
}

plugin.meta = {
    filename: "sflgl.js",
    version: "4.0",
    author: "Kadokun",
    path: "tools",
    note: "fgsi multi-step dan theresav single-step dijalankan bersamaan"
}

export default plugin