/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { generateWAMessageFromContent, prepareWAMessageMedia } from 'baileys'
import { config } from "#root/config.js"
import { sendCarousel } from "../../helper/send-carousel.js"

const LINE = "━━━━━━━━━━━━━━━━"
const URL_RE = /^https?:\/\/\S+$/i
const PIN_HOST_RE = /^(?:[\w-]+\.)*(?:pinterest\.(?:com|co\.[a-z]{2}|[a-z]{2,3})|pin\.it)$/i
const PINIMG_RE = /^https?:\/\/i\.pinimg\.com\/[^/]+\/(.+)$/i

// ukuran standar pinimg
const PINIMG_SIZES = ['60x60', '136x136', '170x', '236x', '474x', '564x', '736x', '600x315', 'originals']

const hasFlag = (t, f) => new RegExp(`(^|\\s)${f}(?=\\s|$)`).test(t)
const stripFlag = (t, f) => t.replace(new RegExp(`(^|\\s)${f}(?=\\s|$)`, "g"), " ").trim()

/**
 * ambil url gambar dari html halaman pin (og:image / image_src)
 * @param {string} html
 * @returns {string|undefined}
 */
function extractImageFromHtml(html) {
    const image =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ||
        html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)/i)?.[1]
    return image?.replace(/&amp;/g, '&')
}

/**
 * url pin (termasuk pin.it) -> url gambar langsung (i.pinimg.com)
 * @param {string} url
 * @returns {Promise<{image: string, pinUrl: string}>}
 */
async function resolvePinImage(url) {
    let host
    try {
        host = new URL(url).hostname
    } catch {
        throw Error('url tidak valid')
    }
    if (!PIN_HOST_RE.test(host)) throw Error('url bukan link pinterest')

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'text/html'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) throw Error(`HTTP ${res.status}`)

    const image = extractImageFromHtml(await res.text())
    if (!image) throw Error('gambar tidak ditemukan di pin ini')

    return { image, pinUrl: res.url }
}

/**
 * variasi ukuran dari satu url pinimg
 * @param {string} imageUrl
 */
function sizesFor(imageUrl) {
    const match = imageUrl.match(PINIMG_RE)
    if (!match) return []
    return PINIMG_SIZES.map(s => ({
        label: s === 'originals' ? 'original' : s,
        value: `https://i.pinimg.com/${s}/${match[1]}`
    }))
}

async function pintSearch(query) {
    const response = await fetch(
        "https://www.pinterest.com/resource/BaseSearchResource/get/?data=" +
        encodeURIComponent('{"options":{"query":"' + encodeURIComponent(query) + '"}}'),
        {
            headers: {
                "screen-dpr": "4",
                "x-pinterest-pws-handler": "www/search/[scope].js",
            },
            method: "head"
        }
    )
    if (!response.ok) throw Error(`error ${response.status} ${response.statusText}`)
    const rhl = response.headers.get("Link")
    if (!rhl) throw Error(`hasil pencarian ${query} kosong`)
    const links = [...rhl.matchAll(/<(.*?)>/gm)].map(v => v[1])
    return links
}

// dipakai buat -d (butuh data video/statistik), kalau gagal fallback ke og:image
const pinterest = {
    getData: async function (pinterestUrl) {
        const pinterestId = await this.getPinterestIdFromUrl(pinterestUrl)
        const res = await fetch("https://id.pinterest.com/_/graphql/", {
            headers: {
                "accept-encoding": "gzip, deflate, br, zstd",
                "content-type": "application/json",
                "cookie": "csrftoken=f199c374cd68fda2595b9cc9bb9c7d5d;}",
                "x-csrftoken": "f199c374cd68fda2595b9cc9bb9c7d5d",
            },
            body: JSON.stringify({
                queryHash: "91dc7817f1acf1c2fb8d505d1c79dedebcb3baa1794065ba3602b843099f8ff7",
                variables: {
                    pinId: pinterestId,
                    isAuth: false,
                    isDesktop: true,
                    shouldPrefetchStoryPinFragment: false,
                    isUnauth: true
                }
            }),
            method: "POST",
        })
        if (!res.ok) throw Error(`${res.status} ${res.statusText} on ${res.url}`)
        const json = await res.json()
        return this.serialize(json)
    },
    serialize: function (pinterestResponse) {
        const data = pinterestResponse.data.v3GetPinQuery.data

        const post = {
            title: data?.unauthOnPageTitle?.trim() || '(no title)',
            description: data?.description?.trim(),
            likesCount: data?.totalReactionCount || 0,
            shareCount: data?.shareCount || 0,
            commentCount: data?.aggregatedPinData?.commentCount || 0,
            createdAt: data?.createdAt || '(unknown)'
        }

        const user = {
            fullName: data?.originPinner?.fullName || '(unknown)',
            username: data?.originPinner?.username || '(unknown)'
        }

        const v = data?.storyPinData?.pages[0]?.blocks[0]?.videoDataV2?.videoList720P?.v720P ||
            data?.videos?.videoList?.v720P

        const content = {
            images: Object.keys(data).filter(k => k.startsWith('images_')).map(k => ({ ...data[k], name: k.replace('images_', '') })),
            videos: v ? [v] : []
        }

        return { user, post, content }
    },
    getPinterestIdFromUrl: async function (pinterestUrl) {
        const shortUrl = /pin\.it/i.test(pinterestUrl)
        let utext
        if (shortUrl) {
            const r = await fetch(pinterestUrl, { method: 'head', redirect: 'follow' })
            utext = r.url
        } else {
            const validHostname = /pinterest/i.test(pinterestUrl)
            if (!validHostname) throw Error(`${pinterestUrl} invalid. hostname invalid`)
            utext = pinterestUrl
        }
        const url = new URL(utext)
        const pinId = url.pathname.match(/\/pin\/(\d+)/)?.[1]
        if (!pinId) throw Error(`${pinterestUrl} invalid. cant parse pinterest id`)
        return pinId
    }
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, text } = ctx

    if (!text) return await m.arashirep(
        `PINTEREST\n${LINE}\n` +
        'pin <kata kunci>\n  cari gambar, dikirim sebagai album\n\n' +
        'pin <kata kunci> -c\n  cari gambar, dikirim sebagai carousel interaktif\n\n' +
        'pin <kata kunci> -u\n  daftar link gambar hasil pencarian\n\n' +
        'pin <url pin> -u\n  link gambar langsung dari satu pin\n\n' +
        'pin <url pin>\n  kirim gambar dari satu pin\n\n' +
        'pin <url pin / url pinimg> -all\n  semua ukuran gambar\n\n' +
        'pin -d <url pin>\n  download media (foto/video)'
    )

    const isAll = hasFlag(text, '-all')
    const isDl = hasFlag(text, '-d')
    const isU = hasFlag(text, '-u')
    const isCarousel = hasFlag(text, '-c') || ctx.command === 'pincar' || ctx.command === 'pincarousel'
    const input = ['-all', '-d', '-u', '-c'].reduce(stripFlag, text)
    const isUrl = URL_RE.test(input)

    // -c: mode carousel interaktif
    if (isCarousel) {
        if (!input) return await m.arashirep('masukkan kata kunci pencarian carousel\ncontoh: pin anime landscape hd -c')
        await m.arashirep(`mencari carousel: ${input}...`)
        try {
            const rawLinks = await pintSearch(input)
            const links = rawLinks.slice(0, 5)
            const cards = links.map((link, idx) => ({
                image: link,
                title: `🖼️ Gambar #${idx + 1}`,
                body: `Pinterest: ${input}`,
                footer: "HD Image",
                buttons: [
                    {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "Lihat HD",
                            url: link,
                            merchant_url: link
                        })
                    }
                ]
            }))
            return await sendCarousel(sock, jid, {
                text: `✨ *Pinterest Carousel: ${input}*\nSwipe kartu di bawah untuk melihat pilihan gambar:`,
                footer: "Pinterest Carousel • Arashi",
                cards,
                quoted: m.raw
            })
        } catch (e) {
            return await m.arashirep(`❌ ${e.message}`)
        }
    }

    // -all: semua ukuran dari satu url
    if (isAll) {
        if (!input) return await m.arashirep('masukkan url pin atau url pinimg\ncontoh: pin https://pin.it/xxxx -all')

        await m.arashirep('mengambil semua ukuran...')
        try {
            const base = PINIMG_RE.test(input) ? input : (await resolvePinImage(input)).image
            const items = sizesFor(base)
            if (!items.length) return await m.arashirep(`UKURAN GAMBAR\n${LINE}\n${base}`)

            return await m.arashirep(
                `UKURAN GAMBAR\n${LINE}\n` +
                items.map(it => `• ${it.label}\n${it.value}`).join('\n\n')
            )
        } catch (e) {
            return await m.arashirep(`❌ ${e.message}`)
        }
    }

    // -d: download dari url pin
    if (isDl) {
        if (!input) return await m.arashirep('masukkan url pin\ncontoh: pin -d https://pinterest.com/pin/xxxx')

        await m.arashirep('mengambil data...')

        let data = null
        try {
            data = await pinterest.getData(input)
        } catch { /* fallback ke og:image di bawah */ }

        if (data) {
            const { user, post, content } = data

            const caption =
                `${post.title}\n` +
                `${post.description ? post.description + '\n' : ''}\n` +
                `by: ${user.fullName} (@${user.username})\n` +
                `likes: ${post.likesCount} • shares: ${post.shareCount} • comments: ${post.commentCount}`

            if (content.videos.length) {
                return await sock.sendMessage(jid, {
                    video: { url: content.videos[0].url },
                    caption
                }, { quoted: m.raw })
            }

            const orig = content.images.find(i => i.name === 'orig') || content.images[content.images.length - 1]
            if (orig) {
                return await sock.sendMessage(jid, {
                    image: { url: orig.url },
                    caption
                }, { quoted: m.raw })
            }
        }

        try {
            const { image, pinUrl } = await resolvePinImage(input)
            return await sock.sendMessage(jid, {
                image: { url: image },
                caption: pinUrl
            }, { quoted: m.raw })
        } catch (e) {
            return await m.arashirep(`❌ ${e.message}`)
        }
    }

    // -u: link gambar
    if (isU) {
        if (!input) return await m.arashirep('masukkan kata kunci atau url pin\ncontoh: pin furina -u')

        if (isUrl) {
            await m.arashirep('mengambil link gambar...')
            try {
                const { image, pinUrl } = await resolvePinImage(input)
                return await m.arashirep(`PINTEREST\n${LINE}\nPin    : ${pinUrl}\nGambar : ${image}`)
            } catch (e) {
                return await m.arashirep(`❌ ${e.message}`)
            }
        }

        await m.arashirep(`mencari: ${input}...`)
        try {
            const links = (await pintSearch(input)).slice(0, 20)
            return await m.arashirep(
                `HASIL PINTEREST: ${input} (${links.length})\n${LINE}\n` +
                links.map((l, i) => `${i + 1}. ${l}`).join('\n')
            )
        } catch (e) {
            return await m.arashirep(`❌ ${e.message}`)
        }
    }

    // default: url pin -> kirim gambarnya (pakai og:image)
    if (isUrl) {
        await m.arashirep('mengambil gambar...')
        try {
            const { image, pinUrl } = await resolvePinImage(input)
            return await sock.sendMessage(jid, {
                image: { url: image },
                caption: pinUrl
            }, { quoted: m.raw })
        } catch (e) {
            return await m.arashirep(`❌ ${e.message}`)
        }
    }

    // default: kata kunci -> album
    await m.arashirep(`mencari: ${input}...`)

    try {
        const links = (await pintSearch(input)).slice(0, 20)

        const medias = await Promise.all(
            links.map(link =>
                prepareWAMessageMedia({ image: { url: link } }, { upload: sock.waUploadToServer })
            )
        )

        const albumMessage = generateWAMessageFromContent(jid, {
            messageContextInfo: {
                messageSecret: Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)))
            },
            albumMessage: {
                expectedImageCount: medias.length,
                expectedVideoCount: 0
            }
        }, { quoted: m.raw })

        await sock.relayMessage(jid, albumMessage.message, { messageId: albumMessage.key.id })

        for (const media of medias) {
            const imgMsg = generateWAMessageFromContent(jid, {
                imageMessage: media.imageMessage
            }, {
                quoted: m.raw
            })
            imgMsg.message.messageContextInfo = {
                messageAssociation: {
                    associationType: 1,
                    parentMessageKey: albumMessage.key
                }
            }
            await sock.relayMessage(jid, imgMsg.message, { messageId: imgMsg.key.id })
            await new Promise(r => setTimeout(r, 1500))
        }
    } catch (e) {
        return await m.arashirep(`❌ ${e.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "pinterest",
    commands: ["pin", "pinterest", "pint", "pincar", "pincarousel"],
    categories: ["downloader"],
    description: "cari pinterest sebagai album / carousel (-c), -u link gambar, -all semua ukuran, -d download dari url pin"
}

plugin.meta = {
    filename: "pin.js",
    version: "6",
    author: config.devName,
    note: "mendukung -c untuk format carouselMessage interaktif",
    path: "downloader"
}

export default plugin
