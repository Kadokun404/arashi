/**
 * @import {PluginCtx, PluginType} from "#types/types.js"
 */

import { generateWAMessageFromContent, prepareWAMessageMedia } from 'baileys'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'

/**
 * scraper facebook (video / reel / foto / album), tanpa api pihak ketiga.
 * @param {string} input url facebook atau kode share (mis. 1DnMKpFgR2)
 */
async function fbdl(input) {
    const pageHeaders = {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'upgrade-insecure-requests': '1',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'cookie': 'wd=1920x1080; _fbp=fb.1.1758800000000.1234567890',
    }

    async function retryFetch(fn, times = 3, delay = 1500) {
        for (let i = 0; i < times; i++) {
            const result = await fn()
            if (result) return result
            if (i < times - 1) await new Promise(r => setTimeout(r, delay))
        }
        return null
    }

    async function imageDims(url) {
        try {
            const r = await fetch(url, { headers: { 'user-agent': UA, referer: 'https://www.facebook.com/', range: 'bytes=0-65535' }, signal: AbortSignal.timeout(12000) })
            if (!r.ok && r.status !== 206) return null
            const b = new Uint8Array(await r.arrayBuffer())
            if (b[0] === 0xff && b[1] === 0xd8) {
                let i = 2
                while (i < b.length - 9) {
                    if (b[i] !== 0xff) { i++; continue }
                    const mk = b[i + 1]
                    if (mk === 0xff || mk === 0xd8 || mk === 0xd9 || (mk >= 0xd0 && mk <= 0xd7)) { i += 2; continue }
                    const len = (b[i + 2] << 8) | b[i + 3]
                    if (len < 2) return null
                    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
                        return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] }
                    }
                    i += 2 + len
                }
            }
            if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
                return { width: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, height: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 }
            }
            return null
        } catch (_) {
            return null
        }
    }

    const found = typeof input === 'string' ? input.match(/https?:\/\/(?:www\.|m\.|web\.|lm\.)?(?:facebook\.com|fb\.watch|fb\.com|fb\.me)\/[^\s"'<>]+/) : null
    const trimmed = typeof input === 'string' ? input.trim() : ''
    const url = found ? found[0]
        : (/^https?:\/\/\S+$/.test(trimmed) ? trimmed
        : (/^[A-Za-z0-9]{8,20}$/.test(trimmed) ? 'https://www.facebook.com/share/p/' + trimmed + '/' : ''))
    if (!url) throw new Error('No Facebook URL or share code found')

    const page = await retryFetch(async () => {
        try {
            const res = await fetch(url, { headers: pageHeaders, redirect: 'follow', signal: AbortSignal.timeout(15000) })
            if (!res.ok) return null
            const html = await res.text()
            if (!html.includes('<title>')) return null
            return { html, permalink: res.url }
        } catch (_) {
            return null
        }
    })

    if (!page) throw new Error('All Facebook sources failed for: ' + url)

    const grabJsonString = (key) => {
        const m = page.html.match(new RegExp('"' + key + '":"((?:[^"\\\\]|\\\\.)*)"'))
        if (!m) return null
        try { return JSON.parse('"' + m[1] + '"') } catch (_) { return null }
    }

    const grabMeta = (prop) => {
        const m = page.html.match(new RegExp('<meta[^>]+(?:property|name)="' + prop + '"[^>]+content="([^"]*)"'))
        return m ? m[1] : null
    }

    const decode = (s) => s
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')

    const jUnesc = (s) => { try { return JSON.parse('"' + s + '"') } catch (_) { return s } }

    const likeM = page.html.match(/"i18n_reaction_count":"(\d+)"/)
        || page.html.match(/"reaction_count":\{"count":(\d+)/)
    let likeCount = likeM ? parseInt(likeM[1], 10) : '-'

    const cM = page.html.match(/"comment_rendering_instance":\{"comments":\{"total_count":(\d+)\}\}/)
        || page.html.match(/"comments":\{"total_count":(\d+)\}\}/)
    let commentCount = cM ? parseInt(cM[1], 10) : '-'

    const previewComment = []
    const eIdx = page.html.search(/"page_size":\d+,"total_count":\d+,"is_not_behind_the_fold"/)
    if (eIdx >= 0) {
        const block = page.html.slice(eIdx, eIdx + 30000)
        let pos = 0
        while (previewComment.length < 3) {
            const bb = block.indexOf('"body":{"text"', pos)
            if (bb < 0) break
            const tx = (block.slice(bb, bb + 800).match(/"body":\{"text":"((?:[^"\\]|\\.)*)"/) || [])[1]
            const aa = block.indexOf('"author":', bb)
            const nm = (aa >= 0 && aa - bb < 8000)
                ? (block.slice(aa, aa + 300).match(/"name":"((?:[^"\\]|\\.)*)"/) || [])[1]
                : null
            if (tx) {
                const cName = jUnesc(nm || 'anonymous')
                const text = jUnesc(tx).replace(/\s*\n+\s*/g, ' ').trim()
                if (text && !previewComment.some(c => c.username === cName && c.text === text)) {
                    previewComment.push({ username: cName, text })
                }
            }
            pos = bb + 10
        }
    }

    const hd = grabJsonString('browser_native_hd_url')
    const sd = grabJsonString('browser_native_sd_url')

    const title = decode((grabMeta('og:title') || page.html.match(/<title>([^<]*)/)?.[1] || '-')).trim().replace(/\s*\|\s*Facebook\s*$/, '') || '-'
    const description = decode(grabMeta('og:description') || '').trim()
    const poster = decode(grabMeta('og:image') || '')

    const postId = (page.permalink.match(/\/(?:reel|videos|watch)\/(\d+)/) || [])[1] || ''
    if (commentCount === '-' && postId) {
        const re = /"total_comment_count":(\d+)/g
        let cm
        while ((cm = re.exec(page.html))) {
            const win = page.html.slice(cm.index, cm.index + 900)
            const tl = win.match(/top_level_post_id\\":\\"(\d+)/)
            if (tl && tl[1] === postId) {
                commentCount = parseInt(cm[1], 10)
                const back = page.html.slice(Math.max(0, cm.index - 700), cm.index)
                const ur = back.match(/"unified_reactors":\{"count":(\d+)/)
                if (ur) likeCount = parseInt(ur[1], 10)
                break
            }
        }
    }
    if (likeCount === '-') {
        const tm = title.match(/([\d,.]+)\s*([KMB])?\s+reactions/i)
        if (tm) {
            const n = parseFloat(tm[1].replace(/,/g, ''))
            if (!isNaN(n)) likeCount = Math.round(n * (tm[2] ? { K: 1e3, M: 1e6, B: 1e9 }[tm[2].toUpperCase()] : 1))
        }
    }

    const video = []
    if (hd) video.push({ quality: 'HD', url: hd, width: 0, height: 0 })
    if (sd) video.push({ quality: 'SD', url: sd, width: 0, height: 0 })

    const albumM = page.html.match(/"all_subattachments":\{"count":\d+,"nodes":\[/)
    const isPhoto = !video.length && !!poster
        && (page.html.includes('"__typename":"Photo"') || page.html.includes('"photo_id"') || !!albumM)
    if (!video.length && !isPhoto) throw new Error('No media found (private, text-only, or not a post): ' + url)

    const images = []
    if (!video.length && albumM) {
        const arrEnd = page.html.indexOf('}],', albumM.index)
        const arr = page.html.slice(albumM.index, arrEnd + 3)
        const parts = arr.split(/\{"(?:deduplication_key|media")/).slice(1)
        for (const p of parts) {
            const vm = p.match(/"viewer_image":\{"height":(\d+),"width":(\d+),"uri":"((?:[^"\\]|\\.)*)"/)
            const im = p.match(/"image":\{"uri":"((?:[^"\\]|\\.)*)"/)
            const imgUrl = jUnesc(vm ? vm[3] : (im ? im[1] : ''))
            if (!imgUrl || images.some(x => x.url === imgUrl)) continue
            images.push({ url: imgUrl, width: vm ? +vm[2] : 0, height: vm ? +vm[1] : 0 })
        }
    }
    if (!images.length && poster) images.push({ url: poster, width: 0, height: 0 })

    let pv = null
    const pvRe = /"playback_video":\{"aspect_ratio":[\d.]+,"height":(\d+),"width":(\d+)(?:[^}]*?"id":"(\d+)")?/g
    let pm
    while ((pm = pvRe.exec(page.html))) {
        if (!pv) pv = pm
        if (pm[3] && pm[3] === postId) { pv = pm; break }
    }
    if (pv) video.forEach(v => { if (!v.width) { v.width = +pv[2]; v.height = +pv[1] } })
    if (images[0] && !images[0].width) {
        if (pv && video.length) {
            images[0].width = +pv[2]
            images[0].height = +pv[1]
        } else {
            const vi = page.html.match(/"viewer_image":\{"height":(\d+),"width":(\d+)\}/)
            if (vi) {
                images[0].width = +vi[2]
                images[0].height = +vi[1]
            } else if (poster) {
                const d = await imageDims(poster)
                if (d) { images[0].width = d.width; images[0].height = d.height }
            }
        }
    }
    if (video.length && images[0] && images[0].width) {
        const aspect = images[0].width / images[0].height
        for (const v of video) {
            if (v.width) continue
            try {
                const em = v.url.match(/[?&]efg=([^&]+)/)
                if (!em) continue
                const ej = JSON.parse(atob(decodeURIComponent(em[1])))
                const cm = (ej.vencode_tag || '').match(/C3\.(\d+)/)
                if (cm) { v.width = parseInt(cm[1], 10); v.height = Math.round(v.width / aspect) }
            } catch (_) { /* tanpa dims */ }
        }
    }

    const ogUrl = grabMeta('og:url') || ''
    const groupMatch = page.permalink.match(/facebook\.com\/groups\/([^/?#]+)/)
        || ogUrl.match(/facebook\.com\/groups\/([^/?#]+)/)
    const gNameM = page.html.match(/"group_name":"((?:[^"\\]|\\.)*)"/)
    const fullname = groupMatch
        ? (gNameM ? jUnesc(gNameM[1]) : (title.split(' | ')[0] || '-'))
        : (title.includes(' | ') ? title.split(' | ').pop() : title)

    let username = '-'
    let userUrl = ''
    if (groupMatch) {
        const opM = page.html.match(/"owning_profile":\{"__typename":"[^"]+","name":"((?:[^"\\]|\\.)*)"/)
        const actorM = opM ? null : page.html.match(/"actors":\[\{"__typename":"[^"]+","name":"((?:[^"\\]|\\.)*)"/)
        if (opM || actorM) {
            username = jUnesc((opM || actorM)[1])
            userUrl = ''
        } else {
            username = 'group:' + decodeURIComponent(groupMatch[1])
            userUrl = 'https://www.facebook.com/groups/' + groupMatch[1]
        }
    } else {
        const blacklist = ['watch', 'share', 'reel', 'videos', 'photo', 'photo.php', 'video.php', 'permalink', 'groups', 'stories', 'marketplace', 'login', 'help']
        const ogSeg = (ogUrl.match(/facebook\.com\/([A-Za-z][A-Za-z0-9._]{1,40})(?:\/|[?#]|$)/) || [])[1]
        const nameMatch = (page.permalink.match(/facebook\.com\/([^/]+)\/(?:videos|reel|watch|photo)/)
            || page.permalink.match(/facebook\.com\/([^/?#]+)/))
        const rawName = nameMatch?.[1] || ''
        const permSeg = (rawName && !blacklist.includes(rawName) && !/^\d+$/.test(rawName))
            ? decodeURIComponent(rawName) : ''
        if (ogSeg && !blacklist.includes(ogSeg)) {
            username = ogSeg
            userUrl = 'https://www.facebook.com/' + ogSeg
        } else if (permSeg) {
            username = permSeg
            userUrl = 'https://www.facebook.com/' + permSeg
        } else if (fullname && fullname !== '-') {
            username = fullname
            userUrl = ogUrl || ''
        }
    }

    return {
        displayUri: images[0]?.url || poster,
        user: { username, fullname, url: userUrl },
        post: {
            caption: description || title,
            title,
            likeCount,
            commentCount,
            permalink: page.permalink,
        },
        previewComment,
        type: video.length ? 'video' : 'image',
        image: images,
        video,
        audioOnly: [],
    }
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('id-ID') : n)

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    const input = (text || '').trim() || (q?.text || '').trim()
    if (!input) return await m.arashirep('masukkan / reply link facebook atau kode share-nya\n\ncontoh:\nfb https://www.facebook.com/share/r/xxxx\nfb 1DnMKpFgR2')

    await m.react('⏳')

    try {
        const res = await fbdl(input)

        let caption = `*${res.user.fullname}*${res.user.username !== '-' ? ` (${res.user.username})` : ''}\n\n${res.post.caption}`.trim()
        if (caption.length > 900) caption = caption.slice(0, 900) + '...'
        caption += `\n\n👍 ${fmt(res.post.likeCount)}  💬 ${fmt(res.post.commentCount)}`

        if (res.type === 'video') {
            const v = res.video[0]
            await sock.sendMessage(jid, {
                video: { url: v.url },
                caption: `${caption}\n📺 ${v.quality}${v.width ? ` • ${v.width}x${v.height}` : ''}`
            }, { quoted: m })
        } else if (res.image.length > 1) {
            const medias = await Promise.all(
                res.image.map(i => prepareWAMessageMedia({ image: { url: i.url } }, { upload: sock.waUploadToServer }))
            )

            const albumMessage = generateWAMessageFromContent(jid, {
                messageContextInfo: { messageSecret: Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))) },
                albumMessage: { expectedImageCount: medias.length, expectedVideoCount: 0 }
            }, { quoted: m })

            await sock.relayMessage(jid, albumMessage.message, { messageId: albumMessage.key.id })

            for (let i = 0; i < medias.length; i++) {
                const imgMsg = generateWAMessageFromContent(jid, {
                    imageMessage: { ...medias[i].imageMessage, caption: i === 0 ? caption : undefined }
                }, { quoted: m })

                imgMsg.message.messageContextInfo = {
                    messageAssociation: { associationType: 1, parentMessageKey: albumMessage.key }
                }

                await sock.relayMessage(jid, imgMsg.message, { messageId: imgMsg.key.id })
                await new Promise(r => setTimeout(r, 800))
            }
        } else {
            await sock.sendMessage(jid, { image: { url: res.image[0].url }, caption }, { quoted: m })
        }

        await m.react('✅')
    } catch (e) {
        await m.react('❌')
        return await m.arashirep(`gagal: ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: 'facebook downloader',
    commands: ['fb', 'fbdl'],
    categories: ['downloader'],
    description: 'download video / reel / foto / album facebook (link atau kode share), support reply'
}

plugin.meta = {
    filename: 'facebook.js',
    version: '1.0.0',
    author: 'Kado',
    note: 'scraper fbdl langsung dari halaman facebook, tanpa api pihak ketiga',
    path: 'downloader'
}

export default plugin