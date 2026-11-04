/**
 * Copyright Kadokun
 * Helper / Scrape: Musixmatch Lyrics & Synced Subtitles (LRC)
 * Mengambil lirik lagu reguler & tersinkronisasi (synced LRC) dari Musixmatch API
 *
 * Cara penggunaan:
 *   const { searchLyrics, searchTracks, getLyrics } = await import('#helper/services/lyrics.js')
 *
 *   // 1. Cari lirik langsung berdasarkan judul/artis:
 *   const data = await searchLyrics('Mahalini Bawa Dia Kembali')
 *   console.log(data.track.title, data.lyrics)
 *
 *   // 2. Cari daftar trek:
 *   const tracks = await searchTracks('What If I Call', { limit: 5 })
 *
 *   // 3. Ambil lirik berdasarkan track_id:
 *   const lyrics = await getLyrics(tracks[0].id)
 */

const USER_AGENT = "Musixmatch/2025120901 CFNetwork/3860.300.31 Darwin/25.2.0"
const APP_ID = "mac-ios-v2.0"
const BASE_URL = "https://apic-appmobile.musixmatch.com/ws/1.1/"
const TOKEN_TTL = 6 * 60 * 60 * 1000
const INVALID_TOKENS = new Set([
  "00000000000000000000000000000000000000000000000000000000"
])

let cachedToken = null
let tokenExpiresAt = 0
let tokenRequest = null

const BASE_HEADERS = {
  "X-Cookie": "x-mxm-token-guid=",
  "x-mxm-app-version": "10.1.1",
  "X-User-Agent": USER_AGENT,
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "application/json"
}

function assertApiResponse(response) {
  if (!response.ok) {
    throw new Error(`Musixmatch request failed (${response.status}).`)
  }
  return response.json()
}

export async function getUserToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  if (tokenRequest && !forceRefresh) return tokenRequest

  tokenRequest = (async () => {
    const url = new URL("token.get", BASE_URL)
    url.search = new URLSearchParams({
      format: "json",
      app_id: APP_ID,
      t: String(Date.now())
    }).toString()

    const data = await assertApiResponse(await fetch(url, {
      headers: BASE_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    }))

    const token = data.message?.body?.user_token
    if (
      typeof token !== "string" ||
      !token ||
      token.startsWith("UpgradeOnly") ||
      INVALID_TOKENS.has(token)
    ) {
      throw new Error("Musixmatch returned an invalid or restricted token.")
    }

    cachedToken = token
    tokenExpiresAt = Date.now() + TOKEN_TTL
    return token
  })()

  try {
    return await tokenRequest
  } finally {
    tokenRequest = null
  }
}

async function requestApi(endpoint, params = {}) {
  let token = await getUserToken()
  const query = new URLSearchParams({
    format: "json",
    app_id: APP_ID,
    usertoken: token,
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)])
    )
  })

  const request = async () => {
    const response = await fetch(`${BASE_URL}${endpoint}?${query}`, {
      headers: BASE_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    })
    return assertApiResponse(response)
  }

  let json = await request()
  if (
    json.message?.header?.status_code === 401 &&
    json.message?.header?.hint === "renew"
  ) {
    token = await getUserToken(true)
    query.set("usertoken", token)
    json = await request()
  }

  const message = json.message
  if (!message) throw new Error("Unexpected response from Musixmatch.")
  const status = message.header?.status_code
  if (status && status >= 400) {
    throw new Error(message.header?.error_message || "Musixmatch API request failed.")
  }

  return message
}

function formatDuration(seconds) {
  if (typeof seconds !== "number" || seconds <= 0) return "0:00"
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
}

export async function searchTracks(query, options = {}) {
  if (typeof query !== "string" || !query.trim()) {
    throw new Error("Search query is required.")
  }

  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 20)
  const page = Math.min(Math.max(Number(options.page) || 1, 1), 100)
  const params = {
    page_size: limit,
    page,
    s_track_rating: "desc",
    f_has_lyrics: options.hasLyricsOnly === false ? 0 : 1
  }

  if (options.title && options.artist) {
    params.q_track = options.title
    params.q_artist = options.artist
  } else {
    params.q_track_artist = query.trim()
  }

  const message = await requestApi("track.search", params)
  const rawTracks = message.body?.track_list || []

  return rawTracks.flatMap(({ track }) => {
    if (!track?.track_id) return []
    return [{
      id: track.track_id,
      title: track.track_name || "Unknown title",
      artist: track.artist_name || "Unknown artist",
      artist_id: track.artist_id ?? null,
      album: track.album_name || "Unknown album",
      album_id: track.album_id ?? null,
      duration: track.track_length ?? 0,
      duration_formatted: formatDuration(track.track_length),
      cover: track.album_coverart_800x800 ||
        track.album_coverart_500x500 ||
        track.album_coverart_350x350 ||
        track.album_coverart_100x100 ||
        null,
      has_lyrics: Boolean(track.has_lyrics),
      has_subtitles: Boolean(track.has_subtitles),
      has_richsync: Boolean(track.has_richsync),
      rating: track.track_rating ?? 0,
      spotify_id: track.track_spotify_id || null,
      share_url: track.track_share_url || null
    }]
  })
}

export async function getLyrics(trackId, options = {}) {
  if (!trackId || !/^\d+$/.test(String(trackId))) {
    throw new Error("A valid track_id is required.")
  }

  const [lyricsMessage, subtitleMessage] = await Promise.all([
    requestApi("track.lyrics.get", { track_id: trackId }),
    options.synced === false
      ? Promise.resolve(null)
      : requestApi("track.subtitle.get", {
          track_id: trackId,
          subtitle_format: "lrc"
        }).catch(() => null)
  ])

  const lyrics = lyricsMessage?.body?.lyrics
  const subtitle = subtitleMessage?.body?.subtitle
  if (!lyrics?.lyrics_body && !subtitle?.subtitle_body) {
    throw new Error("Lyrics were not found for this track.")
  }

  return {
    track_id: Number(trackId),
    lyrics: lyrics?.lyrics_body?.trim() || null,
    synced_lyrics: subtitle?.subtitle_body?.trim() || null,
    language: lyrics?.lyrics_language || subtitle?.subtitle_language || null,
    explicit: Boolean(lyrics?.explicit),
    copyright: lyrics?.lyrics_copyright || null
  }
}

export async function searchLyrics(query, options = {}) {
  const tracks = await searchTracks(query, { ...options, limit: 1 })
  if (!tracks.length) throw new Error(`No tracks found for query: "${query}".`)
  return { track: tracks[0], ...await getLyrics(tracks[0].id, options) }
}

export default { searchTracks, getLyrics, searchLyrics, getUserToken }
