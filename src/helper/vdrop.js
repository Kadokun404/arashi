import http2 from 'http2'
import zlib from 'zlib'
import crypto from 'crypto'
import axios from 'axios'

/*
- HARGAI WOY JANGAN DIHAPUS!
- Skrep by *JH a.k.a DHIKA - FIONY BOT*
- Credits to all Fiony's Bot Admin. 
- Maaf kalo kurang maksimal atau berantakan
- Hasil gabut saja xixixi. 
*/

const pick = (...vals) => {
    for (let i = 0; i < vals.length; i++) {
        const v = vals[i]
        if (v !== undefined ? (v !== null ? (v !== '' ? true : (v === 0 ? true : (v === false ? true : false))) : false) : false) return v
    }
    return ''
}

const jantung = {
    'Connection': 'keep-alive',
    'sec-ch-ua': '"Chromium";v="147", "Not.A/Brand";v="8"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
    'Accept': '*/*',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Accept-Language': 'id-ID,id;q=0.9',
    'Priority': 'u=1, i'
}

export const encryptUrl = (uStr) => {
    const key = Buffer.from('qwertyuioplkjhgf', 'utf8')
    const data = Buffer.from(uStr, 'utf8')
    const padLen = 16 - (data.length % 16)
    const padded = Buffer.alloc(data.length + padLen, padLen)
    data.copy(padded)
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null)
    cipher.setAutoPadding(false)
    return Buffer.concat([cipher.update(padded), cipher.final()]).toString('hex')
}

export const detectPlatform = (uStr) => {
    try {
        const hostRaw = new URL(uStr).hostname
        const host = hostRaw.replace(/^www\./, '').replace(/^m\./, '')
        if (host.includes('instagram.com')) return 'Instagram'
        if (host.includes('tiktok.com')) return 'TikTok'
        if (host.includes('twitter.com') ? true : host.includes('x.com')) return 'Twitter/X'
        if (host.includes('facebook.com') ? true : (host.includes('fb.watch') || host.includes('fb.com'))) return 'Facebook'
        if (host.includes('youtube.com') ? true : host.includes('youtu.be')) return 'YouTube'
        if (host.includes('threads.net') || host.includes('threads.com')) return 'Threads'
        return host
    } catch {
        return 'Unknown'
    }
}

const normImg = (arr) => {
    const isArr = Array.isArray(arr)
    if (isArr === false) return []
    const res = []
    for (let i = 0; i < arr.length; i++) {
        const ix = arr[i]
        if (typeof ix === 'string') {
            res.push({ url: ix, thumbnail: null })
        } else if (typeof ix === 'object' ? (ix !== null ? true : false) : false) {
            const u = pick(ix.image, ix.url, '')
            if (u !== '') res.push({ url: u, thumbnail: pick(ix.thumbnail, null) })
        }
    }
    return res
}

const normVid = (arr) => {
    const isArr = Array.isArray(arr)
    if (isArr === false) return []
    const res = []
    for (let i = 0; i < arr.length; i++) {
        const vx = arr[i]
        if (typeof vx === 'string') {
            res.push({ url: vx, thumbnail: null })
        } else if (typeof vx === 'object' ? (vx !== null ? true : false) : false) {
            const u = pick(vx.video, vx.url, '')
            if (u !== '') res.push({ url: u, thumbnail: pick(vx.thumbnail, null) })
        }
    }
    return res
}

const normMed = (arr) => {
    const isArr = Array.isArray(arr)
    if (isArr === false) return []
    const res = []
    for (let i = 0; i < arr.length; i++) {
        const mx = arr[i]
        if (typeof mx === 'string') {
            res.push({ url: mx, thumbnail: null, type: null })
        } else if (typeof mx === 'object' ? (mx !== null ? true : false) : false) {
            const u = pick(mx.url, mx.video, mx.image, '')
            if (u !== '') res.push({ url: u, thumbnail: pick(mx.thumbnail, null), type: pick(mx.type, null) })
        }
    }
    return res
}

function h2Get(urlStr, headers = {}, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr)
        const client = http2.connect(u.origin)
        let settled = false

        const done = (err, val) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            try { client.close() } catch { }
            if (err) reject(err)
            else resolve(val)
        }

        const timer = setTimeout(() => {
            done(new Error('Request timeout'))
        }, timeoutMs)

        client.on('error', (err) => done(err))

        const reqHeaders = {
            ':method': 'GET',
            ':path': u.pathname + u.search,
            ':scheme': u.protocol.replace(':', ''),
            ':authority': u.host
        }

        for (const [k, v] of Object.entries(headers)) {
            const lk = k.toLowerCase()
            if (lk === 'host' || lk === 'connection') continue
            reqHeaders[lk] = v
        }

        const req = client.request(reqHeaders)
        let status = 0
        let encoding = ''
        const chunks = []

        req.on('response', (hdrs) => {
            status = Number(hdrs[':status'] || 0)
            encoding = String(hdrs['content-encoding'] || '').toLowerCase()
        })

        req.on('data', (chunk) => chunks.push(chunk))

        req.on('end', () => {
            try {
                let buf = Buffer.concat(chunks)
                if (encoding === 'gzip') buf = zlib.gunzipSync(buf)
                else if (encoding === 'deflate') buf = zlib.inflateSync(buf)
                else if (encoding === 'br') buf = zlib.brotliDecompressSync(buf)

                const text = buf.toString('utf8')
                let data = text
                try { data = JSON.parse(text) } catch { }
                done(null, { status, data })
            } catch (e) {
                done(e)
            }
        })

        req.on('error', (err) => done(err))
        req.end()
    })
}

async function requestGet(urlStr, headers) {
    try {
        const res = await h2Get(urlStr, headers)
        if (res.status !== 403) return res
    } catch { }
    const res = await axios.get(urlStr, { headers, timeout: 20000, validateStatus: () => true })
    return { status: res.status, data: res.data }
}

/**
 * VideoDropper AIO Downloader (Instagram, Twitter/X, Facebook, TikTok, Threads, dll)
 * @param {string} input
 */
export async function vdrop(input = '') {
    const baseRes = {
        status: true,
        author_skrep: 'JH a.k.a Dhika',
        kesayangan: 'Fiony Alveria♡',
        data: null
    }

    const urlInput = pick(input, '')
    let targetUrl = ''
    const matchUrl = String(urlInput).match(/https?:\/\/[^\s"'<>]+/i)
    if (matchUrl !== null) {
        targetUrl = matchUrl[0]
    }

    try {
        if (targetUrl === '') throw new Error('Input URL tidak valid lek')

        const platform = detectPlatform(targetUrl)
        const isX = platform === 'Twitter/X' ? true : false

        if (isX) {
            const headX = {}
            const keys = Object.keys(jantung)
            for (let k = 0; k < keys.length; k++) headX[keys[k]] = jantung[keys[k]]
            headX['Host'] = 'x.getrequest.dev'
            headX['Origin'] = 'https://x.getrequest.dev'
            headX['Referer'] = 'https://x.getrequest.dev/'
            headX['Accept'] = 'application/json, text/plain, */*'

            const xUrl = `https://x.getrequest.dev/api/tweet/info?url=${encodeURIComponent(targetUrl)}`

            let resX = null
            let statX = 0
            let isHitX = false
            let atX = 0

            while (isHitX === false ? (atX < 3 ? true : false) : false) {
                const fetchX = await requestGet(xUrl, headX)
                statX = fetchX.status
                resX = fetchX.data
                if (statX === 200) {
                    isHitX = true
                } else {
                    atX++
                    if (atX < 3) await new Promise(r => setTimeout(r, 2000))
                }
            }

            if (statX >= 400 ? true : !resX) {
                const errDetail = typeof resX === 'object' && resX !== null ? pick(resX.error, resX.message, '') : ''
                throw new Error(errDetail || `HTTP Error ${statX} di X-API`)
            }

            const isSuc = resX.success === true ? true : false
            if (isSuc === false) {
                const xMsg = pick(resX.message, resX.error, 'Unknown Error di API X')
                throw new Error(`API Error: ${xMsg}`)
            }

            const rawT = resX.data ? resX.data : []
            const tweet = rawT.length > 0 ? rawT[0] : null
            if (tweet === null) throw new Error('Data tweet kosong lek')

            const author = tweet.author ? tweet.author : {}
            const stats = tweet.stats ? tweet.stats : {}
            const vids = []
            const imgs = []

            const tMed = tweet.media ? tweet.media : []
            for (let i = 0; i < tMed.length; i++) {
                const m = tMed[i]
                const mType = pick(m.type, '')

                if (mType === 'video' ? true : (mType === 'animated_gif' ? true : false)) {
                    const rawVar = m.variants ? m.variants : []
                    const mp4Var = []
                    for (let v = 0; v < rawVar.length; v++) {
                        if (rawVar[v].content_type === 'video/mp4') mp4Var.push(rawVar[v])
                    }
                    mp4Var.sort((a, b) => pick(b.bitrate, 0) - pick(a.bitrate, 0))

                    const hdUrl = mp4Var.length > 0 ? pick(mp4Var[0].url, null) : null
                    const qualArr = []
                    for (let v = 0; v < mp4Var.length; v++) {
                        qualArr.push({
                            quality: pick(mp4Var[v].quality, ''),
                            bitrate: pick(mp4Var[v].bitrate, 0),
                            url: pick(mp4Var[v].url, '')
                        })
                    }

                    vids.push({
                        url: hdUrl,
                        thumbnail: pick(m.thumbnail, null),
                        duration: pick(m.duration_formatted, null),
                        dimensions: pick(m.dimensions, null),
                        qualities: qualArr
                    })
                } else if (mType === 'photo') {
                    imgs.push({
                        url: pick(m.url, m.thumbnail, null),
                        thumbnail: pick(m.thumbnail, null),
                        dimensions: pick(m.dimensions, null)
                    })
                }
            }

            baseRes.data = {
                platform: platform,
                url: targetUrl,
                tweet_id: pick(tweet.id, ''),
                text: pick(tweet.text, pick(tweet.display_text, '')),
                created_at: pick(tweet.created_at, ''),
                author: {
                    name: pick(author.name, ''),
                    username: pick(author.screen_name, ''),
                    avatar: pick(author.avatar_url, ''),
                    is_blue: author.is_blue_verified === true ? true : false
                },
                stats: {
                    replies: pick(stats.replies, 0),
                    retweets: pick(stats.retweets, 0),
                    likes: pick(stats.likes, 0),
                    bookmarks: pick(stats.bookmarks, 0),
                    views: pick(stats.views, 0)
                },
                total_videos: vids.length,
                total_images: imgs.length,
                videos: vids,
                images: imgs
            }
        } else {
            const encrypted = encryptUrl(targetUrl)
            const headVD = {}
            const keys = Object.keys(jantung)
            for (let k = 0; k < keys.length; k++) headVD[keys[k]] = jantung[keys[k]]
            headVD['Host'] = 'api.getrequest.dev'
            headVD['Origin'] = 'https://videodropper.app'
            headVD['Referer'] = 'https://videodropper.app/'
            headVD['url'] = encrypted

            let resVD = null
            let statVD = 0
            let isHitVD = false
            let atVD = 0

            while (isHitVD === false ? (atVD < 3 ? true : false) : false) {
                const fetchVD = await requestGet('https://api.getrequest.dev/allinone', headVD)
                statVD = fetchVD.status
                resVD = fetchVD.data
                if (statVD === 200) {
                    isHitVD = true
                } else {
                    atVD++
                    if (atVD < 3) await new Promise(r => setTimeout(r, 2000))
                }
            }

            if (statVD >= 400 ? true : !resVD) {
                const msg = typeof resVD === 'string' && resVD.length < 200 && !resVD.includes('<!DOCTYPE')
                    ? resVD.trim()
                    : `HTTP Error ${statVD} di VD-API`
                throw new Error(msg)
            }

            const vids = normVid(resVD.video ? resVD.video : [])
            const imgs = normImg(resVD.image ? resVD.image : [])
            const meds = normMed(resVD.media ? resVD.media : [])
            const totalM = vids.length + imgs.length + meds.length

            baseRes.data = {
                platform: platform,
                url: targetUrl,
                encrypted_url: encrypted,
                is_post: resVD.p === true ? true : (resVD.p === 1 ? true : false),
                has_sdl: resVD.sdl === true ? true : false,
                is_carousel: totalM > 1 ? true : false,
                total_videos: vids.length,
                total_images: imgs.length,
                total_media: meds.length,
                total_items: totalM,
                videos: vids,
                images: imgs,
                media: meds,
                original: resVD.original !== undefined ? (resVD.original !== null ? resVD.original : null) : null
            }
        }

        return baseRes
    } catch (error) {
        baseRes.status = false
        baseRes.error = pick(error.message, 'Unknown Error')
        baseRes.data = null
        return baseRes
    }
}

export const JHVidDrop = vdrop
export default vdrop
