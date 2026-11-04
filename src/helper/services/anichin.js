/**
 * scraper anichin.moe (html saja, tanpa puppeteer)
 */

const BASE_URL = "https://anichin.moe"
const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
const clean = s => (s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim()

class AnichinScraper {
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || BASE_URL).replace(/\/+$/, "")
        this.userAgent = options.userAgent || DEFAULT_UA
        this.timeoutMs = options.timeoutMs || 25000
    }

    async _fetch(urlPath, referer = this.baseUrl) {
        const fullUrl = this._resolveUrl(urlPath)

        const res = await fetch(fullUrl, {
            headers: {
                "User-Agent": this.userAgent,
                "Referer": referer,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
            },
            redirect: "follow",
            signal: AbortSignal.timeout(this.timeoutMs)
        })

        if (!res.ok) {
            const hint = [403, 503].includes(res.status) ? " (kemungkinan diblokir proteksi situs)" : ""
            throw new Error(`HTTP ${res.status}${hint}`)
        }

        return res.text()
    }

    _resolveUrl(rawPath) {
        if (!rawPath) return null
        if (rawPath.startsWith("http")) return rawPath
        return `${this.baseUrl}${rawPath.startsWith("/") ? "" : "/"}${rawPath}`
    }

    /** slug biasa -> daftar path yang dicoba berurutan */
    _paths(input, withSeriesFallback = false) {
        if (/^https?:\/\//i.test(input) || input.startsWith("/")) return [input]
        const slug = input.replace(/^\/+|\/+$/g, "")
        return withSeriesFallback ? [`/${slug}/`, `/seri/${slug}/`] : [`/${slug}/`]
    }

    async _fetchFirst(paths) {
        let lastErr
        for (const p of paths) {
            try {
                return { html: await this._fetch(p), path: p }
            } catch (e) {
                lastErr = e
            }
        }
        throw lastErr
    }

    _parseArticles(html) {
        const articles = [...html.matchAll(/<article[^>]*class="[^"]*bs[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)]
        const results = []

        for (const a of articles) {
            const block = a[1]
            const linkMatch =
                block.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i) ||
                block.match(/<a[^>]+href=["']([^"']+)["']/i)
            if (!linkMatch) continue

            const url = this._resolveUrl(linkMatch[1])
            const title = linkMatch[2]
                ? clean(linkMatch[2])
                : (clean(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]) || "Untitled")

            const thumb =
                block.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
                block.match(/data-src=["']([^"']+)["']/i)?.[1]

            results.push({
                title,
                url,
                episode: block.match(/class="epx">([^<]+)<\/span>/i)?.[1]?.trim() || null,
                type: block.match(/class="typez[^"]*">([^<]+)<\/div>/i)?.[1]?.trim() || null,
                status: block.match(/class="status[^"]*">([^<]+)<\/div>/i)?.[1]?.trim() || null,
                thumbnail: this._resolveUrl(thumb)
            })
        }

        return results
    }

    async getLatest(page = 1) {
        const pageNum = Math.max(1, parseInt(page, 10) || 1)
        const html = await this._fetch(pageNum > 1 ? `/page/${pageNum}/` : "/")
        const list = this._parseArticles(html)
        const hasNext = html.includes(`page/${pageNum + 1}/`) || html.includes('class="next page-numbers"')
        return { page: pageNum, hasNext, count: list.length, data: list }
    }

    async search(query, page = 1) {
        if (!query || typeof query !== "string") throw new Error("kata kunci pencarian kosong")

        const pageNum = Math.max(1, parseInt(page, 10) || 1)
        const encoded = encodeURIComponent(query.trim())
        const html = await this._fetch(pageNum > 1 ? `/page/${pageNum}/?s=${encoded}` : `/?s=${encoded}`)
        const list = this._parseArticles(html)
        return { query: query.trim(), page: pageNum, count: list.length, data: list }
    }

    async getSchedule() {
        const html = await this._fetch("/")
        const blocks = [...html.matchAll(/<div class="listSchh">([\s\S]*?)<\/div>\s*<\/div>/gi)]
        const schedule = {}

        for (const s of blocks) {
            const day = s[1].match(/<h2[^>]*>([^<]+)<\/h2>/i)?.[1]?.trim()
            if (!day) continue

            const items = [...s[1].matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
            schedule[day] = items
                .map(it => ({ title: clean(it[2]), url: this._resolveUrl(it[1]) }))
                .filter(it => it.title)
        }

        return schedule
    }

    async getDetail(urlOrSlug) {
        if (!urlOrSlug) throw new Error("url atau slug kosong")

        let { html, path: targetPath } = await this._fetchFirst(this._paths(urlOrSlug, true))

        // kalau yang dikirim url episode, cari halaman serinya lewat breadcrumb
        if (!html.includes('class="eplister"')) {
            const bc = html.match(/<div class="ts-breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
            if (bc) {
                const links = [...bc[1].matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
                if (links.length >= 2 && links[1][1] !== "/") {
                    targetPath = links[1][1]
                    html = await this._fetch(targetPath)
                }
            }
        }

        const titleMatch =
            html.match(/<h1 class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) ||
            html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        const title = titleMatch ? clean(titleMatch[1]) : "Unknown Title"

        const thumb =
            html.match(/class="thumb"[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
            html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src=["']([^"']+)["']/i)?.[1]

        const synMatch = html.match(/<div class="entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        const synopsis = synMatch ? clean(synMatch[1]) : ""

        const metadata = {}
        const speBlock = html.match(/<div class="spe">([\s\S]*?)<\/div>/i)
        if (speBlock) {
            for (const s of speBlock[1].matchAll(/<span>([\s\S]*?)<\/span>/gi)) {
                const t = clean(s[1])
                const idx = t.indexOf(":")
                if (idx > 0) metadata[t.slice(0, idx).trim().toLowerCase()] = t.slice(idx + 1).trim()
            }
        }

        const genMatch =
            html.match(/class="[^"]*genxed[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
            html.match(/class="[^"]*mgen[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        const genres = genMatch
            ? [...genMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)].map(g => g[1].trim())
            : []

        const episodes = []
        const epListMatch = html.match(/<div class="eplister"[^>]*>([\s\S]*?)<\/ul>/i)
        if (epListMatch) {
            for (const li of epListMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
                const link = li[1].match(/<a[^>]+href=["']([^"']+)["']/i)?.[1]
                if (!link) continue

                episodes.push({
                    episode: li[1].match(/<div class="epl-num">([^<]+)<\/div>/i)?.[1]?.trim() || "",
                    title: li[1].match(/<div class="epl-title">([^<]+)<\/div>/i)?.[1]?.trim() || "",
                    url: this._resolveUrl(link),
                    sub: clean(li[1].match(/<div class="epl-sub">([\s\S]*?)<\/div>/i)?.[1]),
                    releaseDate: li[1].match(/<div class="epl-date">([^<]+)<\/div>/i)?.[1]?.trim() || ""
                })
            }
        }

        return {
            title,
            url: this._resolveUrl(targetPath),
            thumbnail: this._resolveUrl(thumb),
            synopsis,
            metadata,
            genres,
            episodeCount: episodes.length,
            episodes
        }
    }

    async getEpisode(urlOrSlug) {
        if (!urlOrSlug) throw new Error("url episode kosong")

        const { html, path } = await this._fetchFirst(this._paths(urlOrSlug))

        const titleMatch =
            html.match(/<h1 class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i) ||
            html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        const title = titleMatch ? clean(titleMatch[1]) : "Episode"

        let seriesTitle = null
        let seriesUrl = null
        const bc = html.match(/<div class="ts-breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        if (bc) {
            const links = [...bc[1].matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
            if (links.length >= 2) {
                seriesTitle = clean(links[1][2])
                seriesUrl = this._resolveUrl(links[1][1])
            }
        }

        const defaultIframe = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1] || null

        // server mirror: value option berisi iframe dalam base64
        const servers = []
        const selectMatch = html.match(/<select class="mirror"[^>]*>([\s\S]*?)<\/select>/i)
        if (selectMatch) {
            for (const opt of selectMatch[1].matchAll(/<option[^>]+value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi)) {
                if (!opt[1]) continue
                try {
                    const decoded = Buffer.from(opt[1], "base64").toString("utf8")
                    const src = decoded.match(/src=["']([^"']+)["']/i)?.[1]
                    if (src) servers.push({ name: clean(opt[2]), iframeUrl: src })
                } catch { }
            }
        }

        const downloads = []
        for (const b of html.matchAll(/<div class="soraurlx">([\s\S]*?)<\/div>/gi)) {
            const quality = clean(b[1].match(/<strong>([^<]+)<\/strong>/i)?.[1]) || "Unknown"
            const links = [...b[1].matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
                .map(l => ({ host: clean(l[2]), url: l[1] }))
            downloads.push({ quality, links })
        }

        const navNext =
            html.match(/<a[^>]+class="[^"]*next[^"]*"[^>]+href=["']([^"']+)["']/i)?.[1] ||
            html.match(/<a[^>]+href=["']([^"']+)["'][^>]*rel="next"/i)?.[1]
        const navPrev =
            html.match(/<a[^>]+class="[^"]*prev[^"]*"[^>]+href=["']([^"']+)["']/i)?.[1] ||
            html.match(/<a[^>]+href=["']([^"']+)["'][^>]*rel="prev"/i)?.[1]

        return {
            title,
            url: this._resolveUrl(path),
            seriesTitle,
            seriesUrl,
            defaultIframe,
            serverCount: servers.length,
            servers,
            downloads,
            prevEpisode: this._resolveUrl(navPrev),
            nextEpisode: this._resolveUrl(navNext)
        }
    }
}

export { AnichinScraper }
