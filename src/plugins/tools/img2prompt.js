/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import axios from "axios"
import { config } from "#root/config.js"

/*
 * img2prompt
 * Author: nath
 * Base: https://generateprompt.ai
 * Sumber: https://whatsapp.com/channel/0029VbC5OZT7T8bXkKXY2d30
 */
async function img2toPrompt(base64Image, feature = "image-to-prompt-en", language = "en") {
    const r = await axios.post(
        "https://wabpfqsvdkdjpjjkbnok.supabase.co/functions/v1/unified-prompt-dev",
        { feature, language, image: base64Image },
        {
            responseType: "stream",
            headers: {
                authorization:
                    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhYnBmcXN2ZGtkanBqamtibm9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzczNjk5MjEsImV4cCI6MjA1Mjk0NTkyMX0.wGGq1SWLIRELdrntLntBz-QH-JxoHUdz8Gq-0ha-4a4",
                "content-type": "application/json",
                origin: "https://generateprompt.ai",
                referer: "https://generateprompt.ai/",
                "user-agent":
                    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36"
            }
        }
    )

    return new Promise((resolve, reject) => {
        let result = ""
        let buffer = ""

        r.data.on("data", chunk => {
            buffer += chunk.toString()
            const lines = buffer.split("\n")
            buffer = lines.pop()

            for (const line of lines) {
                if (!line.startsWith("data:")) continue
                const raw = line.slice(5).trim()
                try {
                    const json = JSON.parse(raw)
                    const text =
                        json?.choices?.[0]?.delta?.content ||
                        json?.content ||
                        json?.text ||
                        null
                    if (text) result += text
                } catch {}
            }
        })

        r.data.on("end", () => resolve(result.trim()))
        r.data.on("error", reject)
    })
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, q } = ctx

    let target = null

    if (q?.content === "imageMessage") {
        target = q
    } else if (m?.content === "imageMessage") {
        target = m
    }

    if (!target) {
        return await m.arashirep("reply atau kirim gambar buat diubah jadi prompt")
    }

 
    try {
        const buffer = await target.download("buffer")
        const base64 = `data:image/jpeg;base64,${buffer.toString("base64")}`

        const result = await img2toPrompt(base64)

        if (!result) {
            throw new Error("gak dapat hasil prompt dari server")
        }

        await m.arashirep(`${result}`)
    } catch (err) {
        await m.arashirep(`eror jir\n${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "img2prompt",
    commands: ["img2prompt", "imagetoprompt", "i2p"],
    categories: ["tools"],
    description: "ubah gambar jadi prompt text (image to prompt)"
}

plugin.meta = {
    filename: "img2prompt.js",
    version: "1.0.0",
    author: config.devName,
    note: "img2prompt via generateprompt.ai (base by nath)",
    path: "tools"
}

export default plugin