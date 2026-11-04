/**
 * Scraper pencarian gambar Google Image
 */

export async function googleSearchImage(query) {
    if (!query) throw new Error("Query pencarian tidak boleh kosong")

    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&safe=active`
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
        },
        signal: AbortSignal.timeout(15000)
    })

    if (!res.ok) {
        throw new Error(`Google Search gagal (HTTP ${res.status})`)
    }

    const html = await res.text()
    const regex = /\["(https:\/\/[^"]+)",\s*(\d+),\s*(\d+)\]/g
    const matches = []
    let m

    while ((m = regex.exec(html)) !== null) {
        const imgUrl = m[1]
        const width = Number(m[2])
        const height = Number(m[3])

        if (
            imgUrl &&
            width > 80 &&
            height > 80 &&
            !imgUrl.includes("gstatic.com") &&
            !imgUrl.includes("google.com") &&
            (imgUrl.endsWith(".jpg") || imgUrl.endsWith(".jpeg") || imgUrl.endsWith(".png") || imgUrl.includes("format=jpg") || imgUrl.includes("format=png"))
        ) {
            matches.push(imgUrl)
        }
    }

    // Fallback regex jika pola pertama sedikit
    if (matches.length < 3) {
        const simpleRegex = /https:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)/gi
        let sm
        while ((sm = simpleRegex.exec(html)) !== null) {
            const raw = sm[0]
            if (!raw.includes("gstatic") && !raw.includes("google") && !matches.includes(raw)) {
                matches.push(raw)
            }
        }
    }

    if (!matches.length) {
        throw new Error(`Tidak ditemukan gambar untuk "${query}"`)
    }

    return {
        query,
        images: [...new Set(matches)]
    }
}
