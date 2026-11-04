import https from "https"
import zlib from "zlib"

const HOME = "https://gemini.google.com/"
const API = "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20260917.13_p0&f.sid=1147530711385426743&hl=en-US&_reqid=2011320&rt=c"

const req = (url, { method = "GET", headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const r = https.request(url, {
        method,
        headers: { "accept-encoding": "gzip, deflate, br", ...headers },
        maxHeaderSize: 262144
    }, res => {
        const chunks = []
        res.on("data", c => chunks.push(c))
        res.on("end", () => {
            let buf = Buffer.concat(chunks)
            try {
                const enc = res.headers["content-encoding"]
                if (enc === "gzip") buf = zlib.gunzipSync(buf)
                else if (enc === "br") buf = zlib.brotliDecompressSync(buf)
                else if (enc === "deflate") buf = zlib.inflateSync(buf)
            } catch {}
            resolve({ status: res.statusCode, headers: res.headers, text: buf.toString("utf8") })
        })
    })
    r.on("error", reject)
    if (body) r.write(body)
    r.end()
})

const getCookie = async () => {
    const r = await req(HOME, { method: "HEAD" })
    const c = r.headers["set-cookie"]?.[0]?.split("; ")?.[0]
    if (!c) throw Error("gagal mendapatkan kuki")
    return c
}

const parseReply = text => {
    let last = null
    for (const line of text.trim().split("\n")) {
        try {
            const o = JSON.parse(line)
            if (typeof o?.[0]?.[2] !== "string") continue
            const a = JSON.parse(o[0][2])
            if (a?.[4]?.[0]?.[1]?.[0]) last = a
        } catch {}
    }
    if (!last) throw Error("format respons tidak dikenali")
    return last
}

/**
 * @param {string} prompt
 * @param {string} [prevSession]
 * @returns {Promise<{response: string, session: string}>}
 */
export async function askGemini(prompt, prevSession = "") {
    let resumeArray = []
    let cookie
    try {
        if (!prevSession) throw 0
        ;({ resumeArray, cookie } = JSON.parse(atob(prevSession)))
    } catch {
        cookie = await getCookie()
    }

    const body = new URLSearchParams({
        "f.req": JSON.stringify([null, JSON.stringify([[prompt], ["en-US"], resumeArray])])
    }).toString()

    const res = await req(API, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            "content-length": Buffer.byteLength(body),
            cookie
        },
        body
    })
    if (res.status !== 200) throw Error(`HTTP ${res.status}`)

    const a = parseReply(res.text)
    return {
        response: a[4][0][1][0],
        session: btoa(JSON.stringify({ cookie, resumeArray: [a[1][0], a[1][1], a[4][0][0]] }))
    }
}
