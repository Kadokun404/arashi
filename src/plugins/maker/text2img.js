/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */
/*
*Text To Image*

Author: Rafli
Base: freegen.app
Code: https://gist.github.com/Raflixyz/3482b9c4f706277a3e0a5791b4136f07
Source: https://whatsapp.com/channel/0029Vb6uvGEDOQIfdz6A4W2V
Community: https://chat.whatsapp.com/KfTAZgFu9mtA1U8vZejXaD
Features: 
- Create Unlimited Images
*/
import crypto from "node:crypto"
import { WebSocket } from "ws"
import { config } from "#root/config.js"

const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
const signer = "https://prompt-signer.freegen.app"
const generator = "https://image-generator.freegen.app"
const wsUrl = "wss://websocket-bridge.freegen.app/ws"

const RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"]

function makeAuth(jobId) {
    const ts = Math.floor(Date.now() / 1000)
    const msg = jobId + ts
    const hash = crypto.createHash("sha256").update(msg).digest("hex")
    const b64 = Buffer.from(hash, "utf8").toString("base64").substring(0, 20)
    return b64 + ":" + ts
}

async function sign(prompt) {
    const r = await fetch(signer, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "user-agent": ua,
            origin: "https://freegen.app",
            referer: "https://freegen.app/"
        },
        body: JSON.stringify({ prompt })
    })

    if (!r.ok) throw new Error("signer " + r.status)
    return await r.json()
}

async function submit(prompt, ratio) {
    const { ts, sig } = await sign(prompt)

    const r = await fetch(generator, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "user-agent": ua,
            origin: "https://freegen.app",
            referer: "https://freegen.app/"
        },
        body: JSON.stringify({ prompt, ts, sig, ratio_id: ratio })
    })

    if (!r.ok) throw new Error("generator " + r.status)
    return await r.json()
}

function waitResult(jobId, timeoutMs = 300000) {
    return new Promise((resolve, reject) => {
        const auth = makeAuth(jobId)
        const ws = new WebSocket(wsUrl, {
            headers: { origin: "https://freegen.app", "user-agent": ua }
        })

        const timer = setTimeout(() => {
            try {
                ws.close()
            } catch {}
            reject(new Error("timeout"))
        }, timeoutMs)

        ws.on("open", () => {
            ws.send(JSON.stringify({ type: "subscribe", job_id: jobId, auth }))
        })

        ws.on("message", raw => {
            const msg = JSON.parse(raw.toString())

            if (msg.type === "status") return

            if (msg.type === "result") {
                clearTimeout(timer)
                try {
                    ws.close()
                } catch {}
                resolve({ ok: true, image: msg.image_data })
            } else if (msg.type === "error") {
                clearTimeout(timer)
                try {
                    ws.close()
                } catch {}
                resolve({ ok: false, error: msg.message || "unknown" })
            }
        })

        ws.on("error", err => {
            clearTimeout(timer)
            reject(err)
        })
    })
}

async function textToImage(prompt, ratio = "1:1") {
    const job = await submit(prompt, ratio)

    if (!job.job_id) {
        return { ok: false, error: "no job id", raw: job }
    }

    const res = await waitResult(job.job_id)

    if (!res.ok) {
        return { ok: false, error: res.error, job_id: job.job_id }
    }

    return {
        ok: true,
        job_id: job.job_id,
        prompt: job.res_prompt,
        ratio,
        image: res.image
    }
}

function toImageBuffer(imageData) {
    // handle both raw base64 and data-uri prefixed base64
    const base64 = imageData.includes(",")
        ? imageData.split(",").pop()
        : imageData
    return Buffer.from(base64, "base64")
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, args } = ctx

    if (!args?.length) {
        return await m.arashirep(
            `contoh: .text2img a cute cat sitting on a moon, digital art | 1:1\n\nratio yang didukung: ${RATIOS.join(", ")}`
        )
    }

    const raw = args.join(" ")
    const [promptRaw, ratioRaw] = raw.split("|").map(s => s?.trim())

    const prompt = promptRaw
    let ratio = ratioRaw || "1:1"

    if (!RATIOS.includes(ratio)) {
        ratio = "1:1"
    }

    await m.arashirep("🎨 sedang generate gambar, tunggu ya...")

    try {
        const result = await textToImage(prompt, ratio)

        if (!result.ok) {
            throw new Error(result.error || "generate gagal")
        }

        const buffer = toImageBuffer(result.image)

        await sock.sendMessage(
            jid,
            {
                image: buffer,
                caption: `🎨 done!\nprompt: ${result.prompt || prompt}\nratio: ${result.ratio}`
            },
            { quoted: m }
        )
    } catch (err) {
        await m.arashirep(`eror jir\n${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "text2img",
    commands: ["text2img", "txt2img", "img"],
    categories: ["maker"],
    description: "generate gambar dari teks (text to image)"
}

plugin.meta = {
    filename: "text2img.js",
    version: "1.0.0",
    author: config.devName,
    note: "freegen.app text2img",
    path: "maker"
}

export default plugin