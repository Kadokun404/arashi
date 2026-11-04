import crypto from 'node:crypto'

/**
 * Rich Response Message Helper
 * 
 * Created by Star Studio (Penyedia Api)
 * AltOffx (Developer), (Modified All Codes)
 * Vortex Imagine!? (Asistant Inteligence)
 */

function newLayout(type, data) {
    return {
        view_model: {
            [Array.isArray(data) ? 'primitives' : 'primitive']: data,
            __typename: `GenAI${type}LayoutViewModel`
        }
    }
}

function waitAll(arr) {
    return Promise.all(arr.map(item => Promise.resolve(item)))
}

function extractIE(input) {
    const inline_entities = []
    let text = input
    let offset = 0

    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url, index) => {
        const start = index - offset
        inline_entities.push({
            offset: start,
            length: label.length,
            url,
            __typename: 'GenAIHyperLinkInlineEntity'
        })
        offset += match.length - label.length
        return label
    })

    text = text.replace(/\*\*([^*]+)\*\*/g, (match, content, index) => {
        const start = index - offset
        inline_entities.push({
            offset: start,
            length: content.length,
            __typename: 'GenAIBoldInlineEntity'
        })
        offset += 4
        return content
    })

    return { text, inline_entities }
}

async function sendRich(sock, jid, opts = {}) {
    const sections = []
    const submessages = []
    const richResponseSources = []

    if (opts.product || opts.products) {
        const raw = opts.product || opts.products
        const items = Array.isArray(raw) ? raw : [raw]
        submessages.push({ messageType: 2, messageText: '[ CANNOT_LOAD_PRODUCT ]' })
        const mapped = items.map(item => {
            const imageUrl = typeof item.image === 'string' ? item.image : item.image?.url ?? item.imageUrl ?? item.image_url ?? ''
            const iconUrl = item.icon_url ?? item.icon ?? imageUrl ?? ''
            return { title: item.title ?? '', brand: item.brand ?? '', price: item.price ?? '', sale_price: item.sale_price ?? item.salePrice ?? '', product_url: item.product_url ?? item.productUrl ?? item.url ?? '', image: { url: imageUrl }, additional_images: [{ url: iconUrl }], __typename: 'GenAIProductItemCardPrimitive' }
        })
        sections.push(newLayout(items.length > 1 ? 'HScroll' : 'Single', items.length > 1 ? mapped : mapped[0]))
    }

    if (opts.image || opts.images) {
        const raw = opts.image || opts.images
        const inputs = Array.isArray(raw) ? raw : [raw]
        submessages.push({ messageType: 1, gridImageMetadata: { gridImageUrl: { imagePreviewUrl: inputs[0] }, imageUrls: inputs.map(url => ({ imagePreviewUrl: url, imageHighResUrl: url, sourceUrl: url })) } })
        inputs.forEach(url => sections.push(newLayout('Single', { media: { url, mime_type: 'image/png' }, imagine_type: 'IMAGE', status: { status: 'READY' }, __typename: 'GenAIImaginePrimitive' })))
    }

    if (opts.video || opts.videos) {
        const raw = opts.video || opts.videos
        const isObjVideo = (v) => v && typeof v === 'object' && !Array.isArray(v) && (v.url || v.videoUrl)
        const rawEntries = Array.isArray(raw) ? raw : [raw]
        submessages.push({ messageType: 2, messageText: '[ CANNOT_LOAD_VIDEO ]' })
        rawEntries.forEach(item => {
            const isObj = isObjVideo(item)
            const rawUrl = isObj ? (item.url ?? item.videoUrl ?? '') : (typeof item === 'string' ? item.split('|')[0] : '')
            const duration = isObj && item.duration != null ? item.duration : (typeof item === 'string' && item.includes('|') ? Number(item.split('|')[1]) || 0 : 0)
            sections.push(newLayout('Single', { media: { url: rawUrl, mime_type: isObj ? (item.mime_type ?? 'video/mp4') : 'video/mp4', file_length: 0, duration }, imagine_type: 'ANIMATE', status: { status: 'READY' }, thumbnail: { raw_media: null }, __typename: 'GenAIImaginePrimitive' }))
        })
    }

    if (opts.reels) {
        const items = Array.isArray(opts.reels) ? opts.reels : [opts.reels]
        sections.push(newLayout('HScroll', items.map(r => ({ reels_url: r.url ?? r.reels_url ?? '', thumbnail_url: r.thumbnail ?? r.thumbnail_url ?? '', creator: r.username ?? r.creator ?? '', avatar_url: r.profile_url ?? r.avatar_url ?? '', reels_title: r.title ?? r.reels_title ?? '', likes_count: r.like ?? r.likes_count ?? 0, shares_count: r.share ?? r.shares_count ?? 0, view_count: r.view ?? r.view_count ?? 0, reel_source: r.source ?? r.reel_source ?? 'IG', is_verified: r.verified ?? r.is_verified ?? false, __typename: 'GenAIReelPrimitive' }))))
        submessages.push({ messageType: 9, contentItemsMetadata: { itemsMetadata: items.map(r => ({ reelItem: { title: r.title ?? '', profileIconUrl: r.profile_url ?? r.avatar_url ?? '', thumbnailUrl: r.thumbnail ?? r.thumbnail_url ?? '', videoUrl: r.url ?? r.reels_url ?? '' } })), contentType: 1 } })
    }

    if (opts.posts || opts.post) {
        const raw = opts.posts || opts.post
        const items = Array.isArray(raw) ? raw : [raw]
        submessages.push({ messageType: 2, messageText: '[ CANNOT_LOAD_POST ]' })
        sections.push(newLayout('HScroll', items.map(p => ({ title: p.title ?? '', subtitle: p.subtitle ?? '', username: p.username ?? '', profile_picture_url: p.profile_picture_url ?? p.profile_url ?? p.icon ?? '', is_verified: p.is_verified ?? p.verified ?? false, thumbnail_url: p.thumbnail_url ?? p.thumbnail ?? '', post_caption: p.post_caption ?? p.caption ?? '', likes_count: p.likes_count ?? p.like ?? 0, comments_count: p.comments_count ?? p.comment ?? 0, shares_count: p.shares_count ?? p.share ?? 0, post_url: p.post_url ?? p.url ?? '', post_deeplink: p.post_deeplink ?? p.deeplink ?? p.url ?? '', source_app: p.source_app ?? p.source ?? 'INSTAGRAM', footer_label: p.footer_label ?? p.footer ?? '', footer_icon: p.footer_icon ?? p.icon ?? '', is_carousel: p.is_carousel ?? true, orientation: p.orientation ?? 'LANDSCAPE', post_type: p.post_type ?? 'PHOTO', __typename: 'GenAIPostPrimitive' }))))
    }

    if (opts.table) {
        const rows = opts.table
        submessages.push({ messageType: 4, tableMetadata: { rows: rows.map((r, i) => ({ items: r, isHeading: i === 0 })), title: opts.tableTitle ?? '' } })
        sections.push(newLayout('Single', { rows: rows.map((r, i) => ({ is_header: i === 0, cells: r })), __typename: 'GenATableUXPrimitive' }))
    }

    if (opts.code) {
        const raw = opts.code
        const isSingle = Array.isArray(raw) && raw.length === 2 && typeof raw[0] === 'string' && typeof raw[1] === 'string'
        const items = isSingle ? [raw] : (Array.isArray(raw) ? raw : [raw])
        items.forEach(item => {
            const lang = Array.isArray(item) ? item[0] : (item.lang ?? item.language ?? 'javascript')
            const codeStr = Array.isArray(item) ? item[1] : (item.code ?? item.content ?? '')
            submessages.push({ messageType: 5, codeMetadata: { codeBlocks: [{ highlightType: 0, codeContent: codeStr }], codeLanguage: lang } })
            sections.push(newLayout('Single', { language: lang, code_blocks: [{ content: codeStr, type: 'DEFAULT' }], __typename: 'GenAICodeUXPrimitive' }))
        })
    }

    if (opts.sources) {
        const items = Array.isArray(opts.sources) ? opts.sources : [opts.sources]
        const mapped = items.map(s => {
            if (Array.isArray(s)) return { source_type: 'THIRD_PARTY', source_display_name: s[2] ?? '', source_subtitle: 'AI', source_url: s[1] ?? '', favicon: { url: s[0] ?? '', mime_type: 'image/jpeg', width: 16, height: 16 } }
            return { source_type: s.type ?? 'THIRD_PARTY', source_display_name: s.name ?? s.display_name ?? '', source_subtitle: s.subtitle ?? 'AI', source_url: s.url ?? '', favicon: { url: s.favicon ?? s.icon ?? '', mime_type: 'image/jpeg', width: 16, height: 16 } }
        })
        sections.push(newLayout('Single', { sources: mapped, __typename: 'GenAISearchResultPrimitive' }))
        mapped.forEach((s, i) => richResponseSources.push({ provider: 0, sourceQuery: '', citationNumber: i + 1, sourceTitle: s.source_display_name }))
    }

    if (opts.tip !== undefined) {
        const tipText = String(opts.tip)
        submessages.push({ messageType: 2, messageText: tipText })
        sections.push(newLayout('Single', { text: tipText, __typename: 'GenAIMetadataTextPrimitive' }))
    }

    const rawSuggest = opts.suggestions ?? opts.suggest ?? opts.pills
    if (rawSuggest) {
        const suggestOpts = typeof rawSuggest === 'object' && !Array.isArray(rawSuggest) && rawSuggest !== null ? rawSuggest : { items: rawSuggest }
        const items = Array.isArray(suggestOpts.items ?? rawSuggest) ? (suggestOpts.items ?? rawSuggest) : [suggestOpts.items ?? rawSuggest]
        const suggest = items.map(text => ({ prompt_text: String(text), prompt_type: 'SUGGESTED_PROMPT', __typename: 'GenAIFollowUpSuggestionPillPrimitive' }))
        const layout = suggestOpts.layout ?? (suggest.length === 1 ? 'Single' : suggestOpts.scroll === false ? 'ActionRow' : 'HScroll')
        sections.push(newLayout(layout, suggest.length === 1 ? suggest[0] : suggest))
    }

    if (opts.footer) {
        sections.push(newLayout('Single', { text: opts.footer, __typename: 'GenAIMetadataTextPrimitive' }))
    }

    if (opts.text) {
        const input = typeof opts.text === 'string' ? opts.text : String(opts.text)
        const { text: extractedText, inline_entities } = extractIE(input)
        submessages.push({ messageType: 2, messageText: extractedText })
        sections.push(newLayout('Single', { text: extractedText, ...(inline_entities.length && { inline_entities }), __typename: 'GenAIMarkdownTextUXPrimitive' }))
    }

    const [resolvedSections, resolvedSubmessages] = await Promise.all([Promise.all(sections.map(s => Promise.resolve(s))), Promise.all(submessages.map(s => Promise.resolve(s)))])

    const proto = {
        messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
            botMetadata: {
                messageDisclaimerText: opts.disclaimer ?? opts.title ?? '',
                richResponseSourcesMetadata: { sources: richResponseSources }
            }
        },
        botForwardedMessage: {
            message: {
                richResponseMessage: {
                    messageType: 1,
                    submessages: resolvedSubmessages,
                    unifiedResponse: {
                        data: Buffer.from(JSON.stringify({ response_id: crypto.randomUUID(), sections: resolvedSections })).toString('base64')
                    },
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedAiBotMessageInfo: { botJid: '0@bot' },
                        forwardOrigin: 4,
                        ...(opts.contextInfo ?? {})
                    }
                }
            }
        }
    }

    return await sock.relayMessage(jid, proto, {})
}

export { sendRich }