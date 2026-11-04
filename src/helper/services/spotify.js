import axios from "axios"
import * as cheerio from "cheerio"

const CONFIG = {
  searchURL: "https://spotmp3.net",
  downloadURL: "https://spotidown.app",
  timeout: 25000,
  limit: 5,
  maxPages: 1,
  retries: 3
}

const cookies = new Map()

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const getHeaders = (extra = {}) => ({
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${CONFIG.searchURL}/`,
  Origin: CONFIG.searchURL,
  ...extra,
  ...(cookies.size ? {
    Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ")
  } : {})
})

function saveCookies(response) {
  const raw = response.headers?.["set-cookie"] || []
  for (const cookie of raw) {
    const pair = cookie.split(";")[0]
    const index = pair.indexOf("=")
    if (index > 0) {
      cookies.set(
        pair.slice(0, index).trim(),
        pair.slice(index + 1).trim()
      )
    }
  }
}

function formatDuration(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return null
  const total = Math.round(Number(ms) / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`
}

async function request(url, options = {}) {
  let lastError
  for (let attempt = 0; attempt < CONFIG.retries; attempt++) {
    try {
      const response = await axios({
        url,
        timeout: CONFIG.timeout,
        ...options,
        validateStatus: status => status >= 200 && status < 500
      })

      saveCookies(response)

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response
    } catch (error) {
      lastError = error
      if (attempt + 1 < CONFIG.retries) {
        await sleep(1000 * (attempt + 1))
      }
    }
  }
  throw lastError
}

async function searchRequest(query, offset = 0) {
  const params = { q: query }
  if (offset > 0) params.offset = offset

  const response = await request(`${CONFIG.searchURL}/api/v1/search`, {
    method: "GET",
    params,
    headers: getHeaders(),
    responseType: "text"
  })

  let data
  try {
    data = typeof response.data === "string" ? JSON.parse(response.data) : response.data
  } catch {
    throw new Error("Search API tidak mengembalikan JSON valid")
  }

  if (!data || (!Array.isArray(data.sections) && !Array.isArray(data.items))) {
    throw new Error("Struktur response Spotify tidak valid")
  }

  return data
}

function mapTrack(item, type = "track") {
  const subtitle = String(item.subtitle || "")
  const artist = subtitle.split(/[·•]/)[0].trim()

  return {
    type: item.type || type,
    title: item.title || null,
    artist: artist || null,
    album: item.type === "album" ? item.title : item.album || null,
    duration: formatDuration(item.duration_ms),
    duration_ms: item.duration_ms ?? null,
    thumbnail: item.cover || item.thumbnail || null,
    url: item.url || (
      item.id && (item.type || type) === "track"
        ? `https://open.spotify.com/track/${item.id}`
        : null
    ),
    id: item.id || null
  }
}

export async function spotifySearch(query, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || CONFIG.limit, 50))
  const maxPages = Math.max(1, Number(options.maxPages) || CONFIG.maxPages)

  const data = await searchRequest(query)
  const sections = Array.isArray(data.sections) ? data.sections : []

  const order = ["track", "artist", "album", "playlist", "podcast", "episode", "show"]
  sections.sort((a, b) => {
    const first = order.indexOf(a.type)
    const second = order.indexOf(b.type)
    return (first < 0 ? 99 : first) - (second < 0 ? 99 : second)
  })

  const results = []

  for (const section of sections) {
    if (results.length >= limit) break
    if (!Array.isArray(section.items)) continue

    let items = [...section.items]
    let offset = section.next_offset
    let page = 1

    while (
      offset != null &&
      items.length < (section.total || limit) &&
      page < maxPages
    ) {
      const next = await searchRequest(query, offset)
      const matched = next.sections?.find(item => item.type === section.type)
      if (!matched || !Array.isArray(matched.items) || !matched.items.length) break

      const seen = new Set(items.map(item => item.id))
      for (const item of matched.items) {
        if (!seen.has(item.id)) {
          items.push(item)
          seen.add(item.id)
        }
      }
      offset = matched.next_offset ?? null
      page++
    }

    for (const item of items) {
      if (results.length >= limit) break
      results.push(mapTrack(item, section.type))
    }
  }

  if (!results.length && Array.isArray(data.items)) {
    for (const item of data.items) {
      if (results.length >= limit) break
      results.push(mapTrack(item))
    }
  }

  results.forEach((item, index) => {
    item.position = index + 1
  })

  return {
    query,
    type: data.type || "search",
    provider: "spotify",
    total: results.length,
    results
  }
}

async function resolveSpotifyUrl(url) {
  let target = url.trim()

  if (target.includes("spotify.link") || target.includes("spotify.com/s/")) {
    try {
      const response = await axios.get(target, {
        headers: { "User-Agent": "WhatsApp/2.21.19.21 A" },
        maxRedirects: 5,
        timeout: 10000,
        validateStatus: status => status >= 200 && status < 400
      })

      if (response.request?.res?.responseUrl) {
        target = response.request.res.responseUrl
      } else if (response.headers.location) {
        target = response.headers.location
      } else if (typeof response.data === "string") {
        const $ = cheerio.load(response.data)
        target = $('meta[property="og:url"]').attr("content") || target
      }
    } catch {}
  }

  return target.split("?")[0]
}

export async function spotifyDownload(url) {
  const cleanUrl = await resolveSpotifyUrl(url)

  const downloadHeaders = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    Referer: `${CONFIG.downloadURL}/`,
    Origin: CONFIG.downloadURL
  }

  const response = await request(`${CONFIG.downloadURL}/action`, {
    method: "POST",
    headers: {
      ...downloadHeaders,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    data: new URLSearchParams({
      url: cleanUrl,
      "g-recaptcha-response": "dummy_token"
    }).toString()
  })

  let data = response.data
  if (typeof data === "string") {
    try {
      data = JSON.parse(data)
    } catch {
      throw new Error("Response download bukan JSON valid")
    }
  }

  if (!data || data.error) {
    throw new Error(data?.message || "Gagal memproses Spotify URL")
  }

  const $ = cheerio.load(data.data || data)
  const forms = $('form[name="submitspurl"]')

  if (!forms.length) {
    throw new Error("Track tidak ditemukan di SpotiDown")
  }

  const tracks = []

  forms.each((index, form) => {
    const element = $(form)
    const dataVal = element.find('input[name="data"]').val() || ""
    const baseVal = element.find('input[name="base"]').val() || cleanUrl
    const tokenVal = element.find('input[name="token"]').val() || ""

    let meta = {}
    if (dataVal) {
      try {
        meta = JSON.parse(Buffer.from(dataVal, "base64").toString("utf8"))
      } catch {}
    }

    const container = element.closest(".grid-container, .row, .spotidown-downloader, div")

    tracks.push({
      index: index + 1,
      title: meta.name || meta.title || container.find("h1, h2, h3").first().text().trim() || "Spotify Track",
      artist: meta.artist || meta.singer || container.find("p").first().text().trim() || null,
      album: meta.album || null,
      duration: meta.duration || null,
      thumbnail: meta.cover || element.closest(".grid-container").find("img").attr("src") || $(".spotidown-downloader-left img").attr("src") || null,
      track_url: meta.tid ? `https://open.spotify.com/track/${meta.tid}` : null,
      payload: {
        data: dataVal,
        base: baseVal,
        token: tokenVal,
        "g-recaptcha-response": "dummy_token"
      }
    })
  })

  const first = tracks[0]

  const trackResponse = await request(`${CONFIG.downloadURL}/action/track`, {
    method: "POST",
    headers: {
      ...downloadHeaders,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ")
    },
    data: new URLSearchParams(first.payload).toString()
  })

  let trackData = trackResponse.data
  if (typeof trackData === "string") {
    try {
      trackData = JSON.parse(trackData)
    } catch {
      throw new Error("Gagal membaca response download track")
    }
  }

  if (!trackData || trackData.error) {
    throw new Error(trackData?.message || "Gagal mendapatkan link download")
  }

  const $download = cheerio.load(trackData.data || trackData)
  const downloads = []

  $download("a").each((_, element) => {
    const href = $download(element).attr("href")
    const text = $download(element).text().trim()

    if (
      !href ||
      !href.startsWith("http") ||
      href.includes("premium.html") ||
      text === "Download Another Song"
    ) {
      return
    }

    const isCover = text.toLowerCase().includes("cover") || href.toLowerCase().includes("cover")

    downloads.push({
      type: isCover ? "image" : "audio",
      quality: isCover ? "Cover HD" : "320kbps",
      url: href
    })
  })

  const audio = downloads.find(item => item.type === "audio")
  if (!audio) {
    throw new Error("Link audio download tidak ditemukan")
  }

  return {
    title: first.title,
    artist: first.artist,
    album: first.album,
    duration: first.duration,
    thumbnail: first.thumbnail,
    type: tracks.length > 1 ? "playlist" : "audio",
    trackCount: tracks.length,
    download: audio.url,
    downloads,
    tracks: tracks.map(track => ({
      index: track.index,
      title: track.title,
      artist: track.artist,
      duration: track.duration,
      thumbnail: track.thumbnail,
      track_url: track.track_url
    }))
  }
}

/**
 * High-level Scrape function:
 * Cari judul lagu atau masukkan link Spotify langsung
 */
export async function scrape(query, options = {}) {
  const keyword = String(query || "").trim()
  const started = Date.now()

  if (!keyword) {
    return {
      status: false,
      message: "Masukkan judul lagu atau link Spotify"
    }
  }

  try {
    const isUrl = /^(https?:\/\/)?(open\.)?spotify\.com\/(track|album|playlist)\/[a-zA-Z0-9]+/i.test(keyword) ||
                  /spotify\.link/i.test(keyword)

    let trackUrl = keyword
    let selectedInfo = null
    let search = null

    if (!isUrl) {
      search = await spotifySearch(keyword, options)
      const tracks = search.results.filter(item => item.type === "track" && item.url)

      if (!tracks.length) {
        return {
          status: false,
          search,
          download: null,
          message: "Lagu tidak ditemukan di Spotify",
          elapsed_ms: Date.now() - started
        }
      }

      const position = Math.max(1, Number(options.position) || 1)
      const selected = tracks[position - 1] || tracks[0]

      trackUrl = selected.url
      selectedInfo = {
        position: selected.position,
        title: selected.title,
        artist: selected.artist,
        url: selected.url,
        thumbnail: selected.thumbnail,
        duration: selected.duration
      }
    }

    const downloaded = await spotifyDownload(trackUrl)

    return {
      status: true,
      query: keyword,
      search,
      selected: selectedInfo || {
        position: 1,
        title: downloaded.title,
        artist: downloaded.artist,
        url: trackUrl,
        thumbnail: downloaded.thumbnail,
        duration: downloaded.duration
      },
      download: downloaded.download,
      download_info: downloaded,
      elapsed_ms: Date.now() - started
    }
  } catch (error) {
    return {
      status: false,
      query: keyword,
      search: null,
      download: null,
      message: error.message,
      elapsed_ms: Date.now() - started
    }
  }
}

export default scrape
