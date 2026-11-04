const API_URL = "https://feelbetterbot.com/"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

async function parseStream(response) {
    const text = await response.text()
    const lines = text.split("\n")
    let fullText = ""

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const data = trimmed.slice(5).trim()
        if (data === "[DONE]" || !data) continue

        try {
            const parsed = JSON.parse(data)
            if (parsed.type === "text-delta") fullText += parsed.delta || ""
            else if (parsed.choices?.[0]) fullText += parsed.choices[0].delta?.content || parsed.choices[0].text || ""
            else if (parsed.content) fullText += parsed.content
            else if (parsed.text) fullText += parsed.text
            else if (parsed.delta) fullText += parsed.delta
        } catch {
            fullText += data
        }
    }

    if (!fullText.trim()) {
        fullText = text
            .split("\n")
            .filter(l => l.trim() && !l.startsWith("event:") && !l.startsWith("id:") && !l.startsWith("retry:"))
            .join("\n")
            .trim()
    }

    return fullText.trim()
}

export async function callFeelbetter(messages) {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": UA,
            Accept: "*/*",
            Origin: "https://feelbetterbot.com",
            Referer: "https://feelbetterbot.com/"
        },
        body: JSON.stringify({ messages })
    })

    if (!response.ok) {
        const raw = await response.text().catch(() => "")
        const err = new Error(`HTTP ${response.status}: ${response.statusText}`)
        err.status = response.status
        err.raw = raw
        throw err
    }

    const text = await parseStream(response)
    if (!text) throw new Error("Respon kosong dari server")
    return text
}
