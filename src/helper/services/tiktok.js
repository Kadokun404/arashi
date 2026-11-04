const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const findTtUrl = (str) => {
    if (!str) return null
    const clean = String(str).replace(/^["'“”\s]+/, '')
    const match = clean.match(/(?:https?:\/\/)?(?:[\w-]+\.)*(?:tiktok\.com|musical\.ly|tt\.site)\/\S*/i)
    if (!match) return null
    const raw = match[0].replace(/[.,;:!?)\]"'”]+$/, '')
    if (!raw) return null
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const pickAuthorInfo = (authorInfos) => {
    if (isObject(authorInfos) && authorInfos.uniqueId) return authorInfos
    if (Array.isArray(authorInfos) && authorInfos[0]) return authorInfos[0]
    return {}
}

const pickImageUrl = (img) =>
    img?.urlList?.[0] || img?.displayImage || img?.imageURL || img?.url || img?.downloadUrlList?.[0] || ''

const grabJsonObject = (text, marker) => {
    const idx = text.indexOf(marker)
    if (idx === -1) return null
    const start = text.indexOf('{', idx)
    if (start === -1) return null
    let depth = 0
    let inStr = false
    for (let i = start; i < text.length; i++) {
        const c = text[i]
        if (inStr) {
            if (c === '\\') { i++; continue }
            if (c === '"') inStr = false
            continue
        }
        if (c === '"') { inStr = true; continue }
        if (c === '{') depth++
        else if (c === '}') {
            depth--
            if (depth === 0) {
                try { return JSON.parse(text.slice(start, i + 1)) } catch { return null }
            }
        }
    }
    return null
}

const FEED_UA = 'com.zhiliaoapp.musically/300904 (Linux; U; Android 10; en_US; ASUS_Z01QD; Build/QQ3A.200805.001; Cronet/TTNetVersion:05187fef 2024-02-27 QuicVersion:dd0cd5e6 2024-02-01)'
const FEED_SERVERS = ['api19-normal-c-useast1a.tiktokv.com', 'api22-normal-c-alisg.tiktokv.com', 'api16-normal-c-useast1a.tiktokv.com']
const FEED_PARAMS = 'channel=googleplay&app_name=musical_ly&version_code=300904&device_platform=android&device_type=ASUS_Z01QD&version=9&iid=7318518857994389254&device_id=7318517321748022790'

const readU32 = (buf, o) => ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0

const probeDims = async (url) => {
    try {
        const res = await fetch(url, {
            headers: { 'user-agent': FEED_UA, referer: 'https://www.tiktok.com/', range: 'bytes=0-393215' },
            signal: AbortSignal.timeout(12000),
        })
        if ((!res.ok && res.status !== 206) || !res.body) return null
        const reader = res.body.getReader()
        const chunks = []
        let total = 0
        while (total < 400000) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
            total += value.length
        }
        try { await reader.cancel() } catch { }
        const buf = new Uint8Array(total)
        let at = 0
        for (const c of chunks) { buf.set(c, at); at += c.length }
        let best = null
        for (let i = 0; i < buf.length - 100; i++) {
            if (buf[i] !== 0x74 || buf[i + 1] !== 0x6b || buf[i + 2] !== 0x68 || buf[i + 3] !== 0x64) continue
            const off = i + (buf[i + 8] === 1 ? 88 : 80)
            const w = Math.round(readU32(buf, off) / 65536)
            const h = Math.round(readU32(buf, off + 4) / 65536)
            if (w > 0 && h > 0 && (!best || w > best.width)) best = { width: w, height: h }
        }
        return best
    } catch {
        return null
    }
}

const resolveNoWatermark = async (awemeId) => {
    let fallback = null
    let fallbackWidth = 0
    for (const srv of FEED_SERVERS) {
        let aweme = null
        try {
            const res = await fetch(`https://${srv}/aweme/v1/feed/?aweme_id=${awemeId}&${FEED_PARAMS}`, {
                headers: { 'user-agent': FEED_UA, accept: 'application/json' },
                signal: AbortSignal.timeout(12000),
            })
            if (!res.ok) continue
            const data = await res.json()
            aweme = data?.aweme_list?.[0]
        } catch { continue }
        if (!aweme?.video) continue
        const rates = [...(aweme.video.bit_rate || [])].sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0))
        const lists = rates.map((r) => r?.play_addr?.url_list).filter(Boolean)
        lists.push(aweme.video.play_addr?.url_list)
        for (const list of lists) {
            for (const u of list || []) {
                if (typeof u !== 'string' || !u.startsWith('http') || u.includes('/music/') || u.includes('mime_type=audio')) continue
                const dims = await probeDims(u)
                if (dims && dims.width >= 720) return u
                if (dims && dims.width > fallbackWidth) { fallbackWidth = dims.width; fallback = u }
            }
        }
    }
    return fallback
}

export async function ttdl(input) {
    const startedAt = Date.now()

    let urlInput = findTtUrl(input)
    if (!urlInput && typeof input === 'string') {
        const code = input.trim()
        if (/^[A-Za-z0-9]{6,20}$/.test(code)) urlInput = `https://vt.tiktok.com/${code}/`
    }
    if (!urlInput) throw new Error('No TikTok URL found')

    const resolveItemId = async () => {
        const direct = urlInput.match(/\/@[^/]+\/(?:video|photo)\/(\d+)/) || urlInput.match(/(?:video|photo)\/(\d+)/)
        if (direct) return direct[1]
        for (let i = 0; i < 3; i++) {
            if (i) await new Promise((r) => setTimeout(r, 1500 * i))
            try {
                const res = await fetch(urlInput, {
                    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
                    redirect: 'follow',
                    signal: AbortSignal.timeout(15000),
                })
                if (!res.ok) continue
                const hit = (res.url || urlInput).match(/(?:video|photo)\/(\d+)/)
                if (hit) return hit[1]
            } catch { continue }
        }
        return null
    }

    const itemId = await resolveItemId()
    if (!itemId) throw new Error('Could not resolve TikTok URL: ' + urlInput)

    let vd = null
    for (let i = 0; i < 4 && !vd; i++) {
        if (i) await new Promise((r) => setTimeout(r, 1200 * i))
        try {
            const res = await fetch(`https://www.tiktok.com/embed/v2/${itemId}`, {
                headers: { 'user-agent': UA, accept: 'text/html' },
                signal: AbortSignal.timeout(15000),
            })
            if (!res.ok) continue
            const html = await res.text()
            const obj = grabJsonObject(html, '"videoData"')
            if (obj?.itemInfos) vd = obj
        } catch { continue }
    }
    if (!vd) throw new Error('All TikTok sources failed for: ' + urlInput)

    const ii = vd.itemInfos || {}
    const author = pickAuthorInfo(vd.authorInfos)
    const music = isObject(vd.musicInfos) ? vd.musicInfos : {}

    const imageUrls = (vd.imagePostInfo?.displayImages || []).map(pickImageUrl).filter(Boolean)
    let videoUrls = (ii.video?.urls || []).filter((u) => typeof u === 'string' && u.startsWith('http'))
    if (!imageUrls.length && !videoUrls.length) throw new Error('No media found: ' + urlInput)

    const meta = ii.video?.videoMeta || {}
    const username = author.uniqueId || ''
    const isPhoto = imageUrls.length > 0

    if (!isPhoto) {
        const hdUrl = await resolveNoWatermark(itemId)
        if (hdUrl) videoUrls = [hdUrl]
    }

    let previewComment = []
    try {
        const res = await fetch(`https://www.tiktok.com/api/comment/list/?aweme_id=${itemId}&count=20&cursor=0&sort_type=0&comment_style=1&device_platform=webapp&aid=1988`, {
            headers: { 'user-agent': UA, referer: 'https://www.tiktok.com/', accept: 'application/json' },
            signal: AbortSignal.timeout(12000),
        })
        if (res.ok) {
            const data = await res.json()
            if (data?.status_code === 0 && Array.isArray(data.comments)) {
                previewComment = data.comments.slice(0, 5).map((c) => ({
                    username: c.user?.unique_id || c.user?.uniqueId || '',
                    nickname: c.user?.nickname || '',
                    text: c.text || '',
                    likes: Number(c.digg_count ?? c.diggCount ?? 0),
                    replies: Number(c.reply_comment_total ?? c.replyTotal ?? 0),
                    time: c.create_time || 0,
                }))
            }
        }
    } catch { }

    const musicUrlRaw = Array.isArray(music.playUrl) ? music.playUrl[0] : music.playUrl

    return {
        type: isPhoto ? 'photo' : 'video',
        id: itemId,
        url: username ? `https://www.tiktok.com/@${username}/${isPhoto ? 'photo' : 'video'}/${itemId}` : urlInput,
        caption: ii.text || '',
        cover: imageUrls[0] || ii.coversOrigin?.[0] || ii.covers?.[0] || '',
        user: {
            username: username || '-',
            fullname: author.nickName || author.nickname || '-',
            url: username ? `https://www.tiktok.com/@${username}` : '',
        },
        stats: {
            views: Number(ii.playCount ?? 0),
            likes: Number(ii.diggCount ?? 0),
            comments: Number(ii.commentCount ?? 0),
            shares: Number(ii.shareCount ?? 0),
        },
        duration: Number(meta.duration || 0),
        video: videoUrls.map((url) => ({
            url,
            width: Number(meta.width || 0),
            height: Number(meta.height || 0),
            ratio: Number(meta.ratio || 0),
        })),
        image: imageUrls.map((url) => ({ url })),
        music: musicUrlRaw
            ? {
                id: music.musicId || '',
                title: music.musicName || '',
                author: music.authorName || '',
                url: typeof musicUrlRaw === 'string' ? musicUrlRaw : '',
                cover: (music.coversLarger || music.covers || [])[0] || '',
            }
            : null,
        previewComment,
        elapsedMs: Date.now() - startedAt,
    }
}

global.ttdl = ttdl
