//script original by nixel
//modified to cjs by gwe
//not hapus credit original nya yang satunya seterah ewe aja gapapa asal cewe jangan lanang



import crypto from 'node:crypto';
import { Toolkit } from '#helper/utils/toolkit.js';
// ================= BaseBuilder =================
class BaseBuilder {
    constructor() {
        this._title = '';
        this._subtitle = '';
        this._body = '';
        this._footer = '';
        this._contextInfo = {};
        this._extraPayload = {};
    }

    setTitle(title) { if (typeof title !== 'string') throw new TypeError('Title must be a string'); this._title = title; return this; }
    setSubtitle(subtitle) { if (typeof subtitle !== 'string') throw new TypeError('Subtitle must be a string'); this._subtitle = subtitle; return this; }
    setBody(body) { if (typeof body !== 'string') throw new TypeError('Body must be a string'); this._body = body; return this; }
    setFooter(footer) { if (typeof footer !== 'string') throw new TypeError('Footer must be a string'); this._footer = footer; return this; }
    setContextInfo(obj) { if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new TypeError('ContextInfo must be a plain object'); this._contextInfo = obj; return this; }
    addPayload(obj) { if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new TypeError('Payload must be a plain object'); Object.assign(this._extraPayload, obj); return this; }
}

// ================= AIRich =================
class AIRich extends BaseBuilder {
    #client;

    constructor(client) {
        if (!client) throw new Error('Socket is required');
        super();
        this.#client = client;
        this._contextInfo = {};
        this._submessages = [];
        this._sections = [];
        this._richResponseSources = [];
    }

    addSubmessage(submessage) {
        const items = Array.isArray(submessage) ? submessage : [submessage];
        for (const item of items) {
            if (typeof item !== 'object' || item === null || Array.isArray(item))
                throw new TypeError('Submessage must be a plain object or array of plain objects');
            this._submessages.push(item);
        }
        return this;
    }

    addSection(section) {
        const items = Array.isArray(section) ? section : [section];
        for (const item of items) {
            if (typeof item !== 'object' || item === null || Array.isArray(item))
                throw new TypeError('Section must be a plain object or array of plain objects');
            this._sections.push(item);
        }
        return this;
    }

    addText(text, { hyperlink = true, citation = true, latex = true } = {}) {
        if (typeof text != 'string') throw new TypeError('Text must be a string');
        const { text: extractedText, inline_entities } = Toolkit.extractIE(text, { hyperlink, citation, latex });
        this._submessages.push({ messageType: 2, messageText: extractedText });
        this._sections.push(AIRich.newLayout('Single', {
            text: extractedText,
            ...(inline_entities.length && { inline_entities }),
            __typename: 'GenAIMarkdownTextUXPrimitive',
        }));
        return this;
    }

    addCode(language, code) {
        if (typeof language !== 'string' || typeof code !== 'string')
            throw new TypeError('Language and code must be a string');
        const meta = AIRich.tokenizer(code, language);
        this._submessages.push({ messageType: 5, codeMetadata: { codeLanguage: language, codeBlocks: meta.codeBlock } });
        this._sections.push(AIRich.newLayout('Single', { language, code_blocks: meta.unified_codeBlock, __typename: 'GenAICodeUXPrimitive' }));
        return this;
    }

    addTable(table, { hyperlink = true, citation = true, latex = true } = {}) {
        if (!Array.isArray(table)) throw new TypeError('Table must be an array');
        const meta = AIRich.toTableMetadata(table, { hyperlink, citation, latex });
        this._submessages.push({ messageType: 4, tableMetadata: { title: meta.title, rows: meta.rows } });
        this._sections.push(AIRich.newLayout('Single', { rows: meta.unified_rows, __typename: 'GenATableUXPrimitive' }));
        return this;
    }

    addSource(sources = []) {
        if (!(Array.isArray(sources) && (sources.every((item) => typeof item === 'string') || sources.every((item) => Array.isArray(item) && item.every((v) => typeof v === 'string')))))
            throw new TypeError('Sources must be a string array or an array of string arrays');
        if (sources.every((item) => typeof item === 'string')) sources = [sources];
        const source = sources.map(([icon, url, text]) => ({
            source_type: 'THIRD_PARTY',
            source_display_name: text ?? '',
            source_subtitle: 'AI',
            source_url: url ?? '',
            favicon: { url: Toolkit.resolveMedia(this.#client, icon ?? '', 'image'), mime_type: 'image/jpeg', width: 16, height: 16 },
        }));
        this._sections.push(AIRich.newLayout('Single', { sources: source, __typename: 'GenAISearchResultPrimitive' }));
        return this;
    }

    addReels(reelsItems = []) {
        if (!((reelsItems && typeof reelsItems === 'object' && !Array.isArray(reelsItems)) ||
            (Array.isArray(reelsItems) && reelsItems.every((item) => item && typeof item === 'object' && !Array.isArray(item)))))
            throw new TypeError('Reels items must be an object or an array of objects');
        if (!Array.isArray(reelsItems)) reelsItems = [reelsItems];

        const reels = reelsItems.map((item) => ({
            ...item,
            _avatar: Toolkit.resolveMedia(this.#client, item.profileIconUrl ?? item.profile_url ?? item.profile ?? '', 'image'),
            _thumbnail: Toolkit.resolveMedia(this.#client, item.thumbnailUrl ?? item.thumbnail ?? '', 'image'),
        }));

        this._submessages.push({
            messageType: 9,
            contentItemsMetadata: {
                contentType: 1,
                itemsMetadata: reels.map((item) => ({
                    reelItem: {
                        title: item.username ?? '',
                        profileIconUrl: item._avatar,
                        thumbnailUrl: item._thumbnail,
                        videoUrl: item.videoUrl ?? item.url ?? '',
                    },
                })),
            },
        });

        reels.forEach((item, idx) => {
            this._richResponseSources.push({
                provider: '\u004E\u0049\u0058\u0045\u004C',
                thumbnailCDNURL: item._thumbnail,
                sourceProviderURL: item.videoUrl ?? item.url ?? '',
                sourceQuery: '',
                faviconCDNURL: item._avatar,
                citationNumber: idx + 1,
                sourceTitle: item.username ?? '',
            });
        });

        this._sections.push(AIRich.newLayout('HScroll', reels.map((item) => ({
            reels_url: item.videoUrl ?? item.url ?? '',
            thumbnail_url: item._thumbnail,
            creator: item.username ?? item.title ?? '',
            avatar_url: item._avatar,
            reels_title: item.reels_title ?? item.title ?? '',
            likes_count: item.likes_count ?? item.like ?? 0,
            shares_count: item.shares_count ?? item.share ?? 0,
            view_count: item.view_count ?? item.view ?? 0,
            reel_source: item.reel_source ?? item.source ?? 'IG',
            is_verified: !!(item.is_verified || item.verified),
            __typename: 'GenAIReelPrimitive',
        }))));

        return this;
    }

    addImage(imageUrl, { resolveUrl = false } = {}) {
        if (!(typeof imageUrl === 'string' || Buffer.isBuffer(imageUrl) ||
            (Array.isArray(imageUrl) && imageUrl.every((v) => typeof v === 'string' || Buffer.isBuffer(v)))))
            throw new TypeError('imageUrl must be string | buffer | array of string/buffer');

        const list = Array.isArray(imageUrl)
            ? imageUrl.map((v) => { const url = Toolkit.resolveMedia(this.#client, v, 'image', { resolveUrl }); return { imagePreviewUrl: url, imageHighResUrl: url, sourceUrl: url }; })
            : (() => { const url = Toolkit.resolveMedia(this.#client, imageUrl, 'image', { resolveUrl }); return [{ imagePreviewUrl: url, imageHighResUrl: url, sourceUrl: url }]; })();

        this._submessages.push({ messageType: 1, gridImageMetadata: { gridImageUrl: { imagePreviewUrl: list[0]?.imagePreviewUrl }, imageUrls: list } });
        list.forEach(({ imagePreviewUrl }) => {
            this._sections.push(AIRich.newLayout('Single', { media: { url: imagePreviewUrl, mime_type: 'image/png' }, imagine_type: 'IMAGE', status: { status: 'READY' }, __typename: 'GenAIImaginePrimitive' }));
        });
        return this;
    }

    addVideo(videoUrl, { autoFill = true } = {}) {
        const isObjectVideo = (v) => v && typeof v === 'object' && v.url;
        const isValidPrimitive = typeof videoUrl === 'string' || Buffer.isBuffer(videoUrl) || isObjectVideo(videoUrl) ||
            (Array.isArray(videoUrl) && videoUrl.every((v) => typeof v === 'string' || Buffer.isBuffer(v) || isObjectVideo(v)));
        if (!isValidPrimitive) throw new TypeError('videoUrl must be string | buffer | object | array');

        const items = Array.isArray(videoUrl) ? videoUrl : [videoUrl];
        this._submessages.push({ messageType: 2, messageText: '[ CANNOT_LOAD_VIDEO - \u004E\u0049\u0058\u0045\u004C ]' });

        items.forEach((item) => {
            const isObject = isObjectVideo(item);
            const url = isObject ? Toolkit.resolveMedia(this.#client, item.url ?? '', 'video') : Toolkit.resolveMedia(this.#client, item, 'video');
            const bufferPromise = autoFill ? Promise.resolve(url).then((u) => Toolkit.fetchBuffer(u)) : null;
            const file_length = isObject && item.file_length != null ? item.file_length : autoFill ? bufferPromise.then((b) => b?.length ?? 0) : 0;
            const duration = isObject && item.duration != null ? item.duration : autoFill ? bufferPromise.then((b) => Toolkit.getMp4Duration(b, { silent: true })) : 0;
            const thumbnail = isObject && item.thumbnail
                ? Toolkit.resolveMedia(this.#client, item.thumbnail, 'image', { result: 'base64', resize: true, width: 300, height: 300 })
                : autoFill ? bufferPromise ? bufferPromise.then((b) => Toolkit.getMp4Preview(b, { time: 0, result: 'base64' })) : null : null;

            this._sections.push(AIRich.newLayout('Single', {
                media: { url, mime_type: isObject ? (item.mime_type ?? 'video/mp4') : 'video/mp4', file_length, duration },
                imagine_type: 'ANIMATE',
                status: { status: 'READY' },
                thumbnail: { raw_media: thumbnail },
                __typename: 'GenAIImaginePrimitive',
            }));
        });
        return this;
    }

    addProduct(data = {}) {
        if (!((data && typeof data === 'object' && !Array.isArray(data)) ||
            (Array.isArray(data) && data.every((item) => item && typeof item === 'object' && !Array.isArray(item)))))
            throw new TypeError('Product items must be an object or an array of objects');

        this._submessages.push({ messageType: 2, messageText: '[ CANNOT_LOAD_PRODUCT - NIXEL ]' });
        const items = Array.isArray(data) ? data : [data];
        const product = items.map((item) => ({
            title: item.title, brand: item.brand, price: item.price, sale_price: item.sale_price,
            product_url: item.product_url ?? item.url,
            image: { url: Toolkit.resolveMedia(this.#client, item.image_url ?? item.image, 'image') },
            additional_images: [{ url: Toolkit.resolveMedia(this.#client, item.icon_url ?? item.icon, 'image') }],
            __typename: 'GenAIProductItemCardPrimitive',
        }));
        this._sections.push(AIRich.newLayout(Array.isArray(data) ? 'HScroll' : 'Single', Array.isArray(data) ? product : product[0]));
        return this;
    }

    addPost(data = {}) {
        if (!((data && typeof data === 'object' && !Array.isArray(data)) ||
            (Array.isArray(data) && data.every((item) => item && typeof item === 'object' && !Array.isArray(item)))))
            throw new TypeError('Post items must be an object or an array of objects');

        const posts = Array.isArray(data) ? data : [data];
        this._submessages.push({ messageType: 2, messageText: '[ CANNOT_LOAD_POST - BOCCHI ]' });
        const primitives = posts.map((p) => ({
            title: p.title ?? '', subtitle: p.subtitle ?? '', username: p.username ?? '',
            profile_picture_url: Toolkit.resolveMedia(this.#client, p.profile_picture_url ?? p.profile_url ?? p.profile ?? '', 'image'),
            is_verified: !!(p.is_verified || p.verified),
            thumbnail_url: Toolkit.resolveMedia(this.#client, p.thumbnail_url ?? p.thumbnail ?? '', 'image'),
            post_caption: p.post_caption ?? p.caption ?? '',
            likes_count: p.likes_count ?? p.like ?? 0, comments_count: p.comments_count ?? p.comment ?? 0,
            shares_count: p.shares_count ?? p.share ?? 0,
            post_url: p.post_url ?? p.url ?? '', post_deeplink: p.post_deeplink ?? p.deeplink ?? '',
            source_app: p.source_app || p.source || 'INSTAGRAM', footer_label: p.footer_label ?? p.footer ?? '',
            footer_icon: Toolkit.resolveMedia(this.#client, p.footer_icon ?? p.icon ?? '', 'image'),
            is_carousel: posts.length > 1, orientation: p.orientation ?? 'LANDSCAPE', post_type: p.post_type ?? 'VIDEO',
            __typename: 'GenAIPostPrimitive',
        }));
        this._sections.push(AIRich.newLayout('HScroll', primitives));
        return this;
    }

    addTip(text) {
        this._submessages.push({ messageType: 2, messageText: text });
        this._sections.push(AIRich.newLayout('Single', { text, __typename: 'GenAIMetadataTextPrimitive' }));
        return this;
    }

    addSuggest(suggestion, { scroll = true, layout } = {}) {
        if (!(typeof suggestion === 'string' || (Array.isArray(suggestion) && suggestion.every((v) => typeof v === 'string'))))
            throw new TypeError('Suggestion must be a string or array of strings');
        const suggest = Array.isArray(suggestion)
            ? suggestion.map((text) => ({ prompt_text: text, prompt_type: 'SUGGESTED_PROMPT', __typename: 'GenAIFollowUpSuggestionPillPrimitive' }))
            : [{ prompt_text: suggestion, prompt_type: 'SUGGESTED_PROMPT', __typename: 'GenAIFollowUpSuggestionPillPrimitive' }];
        const type = layout ?? (suggest.length === 1 ? 'Single' : scroll ? 'HScroll' : 'ActionRow');
        this._sections.push(AIRich.newLayout(type, type === 'Single' ? suggest[0] : suggest, { __typename: 'GenAIUnifiedResponseSection' }));
        return this;
    }

    // ── Inline Image ──
addInlineImage(imageUrl, { caption = '', alignment = 0, tapLink = '' } = {}) {
    let url = imageUrl;
    if (typeof url !== 'string') {
        url = Toolkit.resolveMedia(this.#client, url, 'image');
    }
    if (!url) {
        console.warn('[AIRich] Inline image URL tidak valid:', imageUrl);
        return this;
    }

    this._submessages.push({
        messageType: 3,
        imageMetadata: {
            imageUrl: {
                imagePreviewUrl: url,
                imageHighResUrl: url,
                sourceUrl: url,
            },
            imageText: caption || '',
            alignment: alignment || 0,
            tapLinkUrl: tapLink || url,
        },
    });
    
    return this;
}

// ── Dynamic (GIF) ──
addDynamic(type, url, loopCount = 1) {
    if (!url) {
        console.warn('[AIRich] Dynamic URL kosong');
        return this;
    }
    const mimeType = type === 2 ? 'image/gif' : 'image/png';
    this._submessages.push({
        messageType: 6,
        dynamicMetadata: {
            type: type, 
            version: 1,
            url: url,
            loopCount: loopCount || 0, 
        },
    });
    this._sections.push(AIRich.newLayout('Single', {
        media: {
            url: url,
            mime_type: mimeType,
            file_length: 0,
            duration: 0,
        },
        imagine_type: 'ANIMATE',
        status: { status: 'READY' },
        thumbnail: { raw_media: '' },
        __typename: 'GenAIImaginePrimitive',
    }));
    return this;
}

// ── Map ──
addMap(lat, lng, { title = '', body = '', showInfoList = false } = {}) {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        console.warn('[AIRich] addMap: lat/lng harus angka');
        return this;
    }

    this._submessages.push({
        messageType: 7,
        mapMetadata: {
            centerLatitude: lat,
            centerLongitude: lng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
            annotations: [{
                annotationNumber: 1,
                latitude: lat,
                longitude: lng,
                title: title || '',
                body: body || '',
            }],
            showInfoList: !!showInfoList,
        },
    });
    this._sections.push(AIRich.newLayout('Single', {
        location: {
            latitude: lat,
            longitude: lng,
            title: title || '',
            body: body || '',
        },
        __typename: 'GenAIMapPrimitive',
    }));
    return this;
}

    addLatex(expression) {
        this._submessages.push({
            messageType: 8,
            latexMetadata: {
                text: expression,
                expressions: [{ latexExpression: expression, url: '', width: 200, height: 50, fontHeight: 12, imageTopPadding: 10, imageLeadingPadding: 10, imageBottomPadding: 10, imageTrailingPadding: 10 }],
            },
        });
        this._sections.push(AIRich.newLayout('Single', { latex: expression, __typename: 'GenAILatexPrimitive' }));
        return this;
    }

    // ──────────────────────────────
    addAudio(url, { title = '', artist = '', duration = 0, thumbnail = '', mimeType = 'audio/mpeg' } = {}) {
        const thumbUrl = thumbnail ? Toolkit.resolveMedia(this.#client, thumbnail, 'image') : null;
        this._submessages.push({
            messageType: 10,
            audioMetadata: {
                url,
                title,
                artist,
                duration,
                mimeType,
                ...(thumbUrl ? { thumbnailUrl: thumbUrl } : {}),
            },
        });
        this._sections.push(AIRich.newLayout('Single', {
            audio_url: url,
            title,
            artist,
            duration,
            mime_type: mimeType,
            ...(thumbUrl ? { thumbnail_url: thumbUrl } : {}),
            __typename: 'GenAIAudioPrimitive',
        }));
        return this;
    }

    addFile(url, { fileName = 'document', mimeType = 'application/octet-stream', fileSize = 0, pageCount = 0 } = {}) {
        this._submessages.push({
            messageType: 11,
            fileMetadata: { url, fileName, mimeType, fileSize, pageCount },
        });
        this._sections.push(AIRich.newLayout('Single', {
            file_url: url,
            file_name: fileName,
            mime_type: mimeType,
            file_size: fileSize,
            page_count: pageCount,
            __typename: 'GenAIFilePrimitive',
        }));
        return this;
    }

    addLocationCard(data = {}) {
        const thumbUrl = data.thumbnail ? Toolkit.resolveMedia(this.#client, data.thumbnail, 'image') : null;
        this._submessages.push({
            messageType: 12,
            locationCardMetadata: {
                name:        data.name    || '',
                address:     data.address || '',
                latitude:    data.lat     || 0,
                longitude:   data.lng     || 0,
                rating:      data.rating  || 0,
                reviewCount: data.reviews || 0,
                category:    data.category || '',
                url:         data.url      || '',
                ...(thumbUrl ? { thumbnailUrl: thumbUrl } : {}),
            },
        });
        this._sections.push(AIRich.newLayout('Single', {
            name:         data.name    || '',
            address:      data.address || '',
            latitude:     data.lat     || 0,
            longitude:    data.lng     || 0,
            rating:       data.rating  || 0,
            review_count: data.reviews || 0,
            category:     data.category || '',
            place_url:    data.url      || '',
            ...(thumbUrl ? { thumbnail_url: thumbUrl } : {}),
            __typename: 'GenAILocationCardPrimitive',
        }));
        return this;
    }

    addPoll(question, options = [], { multiSelect = false } = {}) {
        if (typeof question !== 'string') throw new TypeError('Question must be a string');
        if (!Array.isArray(options) || options.length < 2) throw new TypeError('Options must be array with at least 2 items');

        const pollOptions = options.map((text, idx) => ({
            optionId: String(idx + 1),
            optionText: text,
            voteCount: 0,
        }));

        this._submessages.push({
            messageType: 13,
            pollMetadata: { question, options: pollOptions, multiSelect },
        });
        this._sections.push(AIRich.newLayout('Single', {
            question,
            options: pollOptions.map((o) => ({ id: o.optionId, text: o.optionText, vote_count: 0 })),
            multi_select: multiSelect,
            __typename: 'GenAIPollPrimitive',
        }));
        return this;
    }

    addContactCard(data = {}) {
        const avatarUrl = data.avatar ? Toolkit.resolveMedia(this.#client, data.avatar, 'image') : null;
        this._submessages.push({
            messageType: 14,
            contactCardMetadata: {
                name:  data.name  || '',
                phone: data.phone || data.jid?.split('@')[0] || '',
                jid:   data.jid   || '',
                email: data.email || '',
                ...(avatarUrl ? { avatarUrl } : {}),
            },
        });
        this._sections.push(AIRich.newLayout('Single', {
            name:      data.name  || '',
            phone:     data.phone || data.jid?.split('@')[0] || '',
            jid:       data.jid   || '',
            email:     data.email || '',
            ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
            __typename: 'GenAIContactCardPrimitive',
        }));
        return this;
    }

    addWeather(data = {}) {
        this._submessages.push({ messageType: 2, messageText: `🌤 ${data.location || ''}: ${data.temp || ''}°${data.unit || 'C'} — ${data.condition || ''}` });
        this._sections.push(AIRich.newLayout('Single', {
            location:       data.location  || '',
            temperature:    data.temp      || 0,
            unit:           data.unit      || 'C',
            condition:      data.condition || '',
            humidity:       data.humidity  || 0,
            wind_speed:     data.wind      || 0,
            feels_like:     data.feels     || 0,
            forecast:       data.forecast  || [],
            icon_url:       data.icon      || '',
            __typename: 'GenAIWeatherPrimitive',
        }));
        return this;
    }

    addNews(articles) {
        const items = Array.isArray(articles) ? articles : [articles];
        this._submessages.push({ messageType: 2, messageText: '[ CANNOT_LOAD_NEWS - NIXEL ]' });
        const primitives = items.map((a) => ({
            title:        a.title    || '',
            subtitle:     a.subtitle || a.source || '',
            summary:      a.summary  || a.description || '',
            url:          a.url      || '',
            published_at: a.date     || '',
            thumbnail_url: Toolkit.resolveMedia(this.#client, a.thumbnail || a.image || '', 'image'),
            source_name:  a.source   || '',
            source_icon:  Toolkit.resolveMedia(this.#client, a.icon || '', 'image'),
            __typename: 'GenAINewsCardPrimitive',
        }));
        this._sections.push(AIRich.newLayout(items.length > 1 ? 'HScroll' : 'Single', items.length > 1 ? primitives : primitives[0]));
        return this;
    }

    // ── build & send ──────────────────────────────────────────────────────
    async build({ forwarded = true, notification = false, includesUnifiedResponse = true, includesSubmessages = true, quoted, quotedParticipant, ...options } = {}) {
        const forward = forwarded ? {
            forwardingScore: 1, isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: '0@bot' }, forwardOrigin: 4,
        } : {};

        const notif = notification ? {
            sessionTransparencyMetadata: {
                disclaimerText: '~ Ahmad tumbuh kembang',
                hcaId: `hca_${Date.now()}`,
                sessionTransparencyType: 1,
            },
        } : {};

        const qObj = quoted ? {
            stanzaId: quoted?.key?.id || quoted?.id,
            participant: quotedParticipant || quoted?.key?.participant || quoted?.key?.remoteJid,
            quotedType: 0,
            quotedMessage: typeof quoted === 'object' && quoted !== null ? (quoted.message ?? quoted) : undefined,
        } : {};

        const sections = this._footer
            ? [...(await Toolkit.waitAllPromises(this._sections)), AIRich.newLayout('Single', { text: this._footer, __typename: 'GenAIMetadataTextPrimitive' })]
            : [...(await Toolkit.waitAllPromises(this._sections))];

        return {
            messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
                botMetadata: {
                    messageDisclaimerText: this._title,
                    richResponseSourcesMetadata: { sources: this._richResponseSources },
                    ...notif,
                },
            },
            ...this._extraPayload,
            botForwardedMessage: {
                message: {
                    richResponseMessage: {
                        messageType: 1,
                        submessages: includesSubmessages ? await Toolkit.waitAllPromises(this._submessages) : [],
                        unifiedResponse: {
                            data: includesUnifiedResponse
                                ? Buffer.from(JSON.stringify({ response_id: crypto.randomUUID(), sections })).toString('base64')
                                : '',
                        },
                        contextInfo: { ...forward, ...qObj, ...this._contextInfo },
                    },
                },
            },
        };
    }

    async send(jid, { forwarded, notification, includesUnifiedResponse, includesSubmessages, ...options } = {}) {
        const msg = await this.build({ forwarded, notification, includesUnifiedResponse, includesSubmessages, ...options });
        return await this.#client.relayMessage(jid, msg, { ...options });
    }

    // ── Static helpers ────────────────────────────────────────────────────
    static tokenizer(code, lang = 'javascript') {
        const keywordsMap = {
            javascript: new Set(['break','case','catch','continue','debugger','delete','do','else','finally','for','function','if','in','instanceof','new','return','switch','this','throw','typeof','var','void','while','with','true','false','null','undefined','class','const','let','super','extends','export','import','yield','static','constructor','async','await','get','set']),
            typescript: new Set(['abstract','any','as','asserts','bigint','boolean','declare','enum','implements','infer','interface','is','keyof','module','namespace','never','readonly','require','number','object','override','private','protected','public','satisfies','string','symbol','type','unknown','using','from','break','case','catch','continue','do','else','finally','for','function','if','new','return','switch','this','throw','try','var','void','while','class','const','let','extends','import','export','async','await']),
            python: new Set(['False','None','True','and','as','assert','async','await','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield']),
            java: new Set(['abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default','do','double','else','enum','extends','final','finally','float','for','goto','if','implements','import','instanceof','int','interface','long','native','new','package','private','protected','public','return','short','static','strictfp','super','switch','synchronized','this','throw','throws','transient','try','void','volatile','while']),
            golang: new Set(['break','case','chan','const','continue','default','defer','else','fallthrough','for','func','go','goto','if','import','interface','map','package','range','return','select','struct','switch','type','var']),
            c: new Set(['auto','break','case','char','const','continue','default','do','double','else','enum','extern','float','for','goto','if','int','long','register','return','short','signed','sizeof','static','struct','switch','typedef','union','unsigned','void','volatile','while']),
            cpp: new Set(['alignas','alignof','and','auto','bool','break','case','catch','class','const','constexpr','continue','delete','do','double','else','enum','explicit','export','extern','false','float','for','friend','if','inline','int','long','mutable','namespace','new','noexcept','nullptr','operator','private','protected','public','return','short','signed','sizeof','static','struct','switch','template','this','throw','true','try','typedef','typename','union','unsigned','using','virtual','void','while']),
            php: new Set(['abstract','and','array','as','break','callable','case','catch','class','clone','const','continue','declare','default','do','echo','else','elseif','empty','enddeclare','endfor','endforeach','endif','endswitch','endwhile','extends','final','finally','fn','for','foreach','function','global','goto','if','implements','include','include_once','instanceof','interface','match','namespace','new','null','or','private','protected','public','require','require_once','return','static','switch','throw','trait','try','use','var','while','yield']),
            rust: new Set(['as','break','const','continue','crate','else','enum','extern','false','fn','for','if','impl','in','let','loop','match','mod','move','mut','pub','ref','return','self','Self','static','struct','super','trait','true','type','unsafe','use','where','while']),
            html: new Set(['html','head','body','div','span','p','a','img','video','audio','script','style','link','meta','form','input','button','table','tr','td','th','ul','ol','li','section','article','header','footer','nav','main']),
            bash: new Set(['if','then','else','elif','fi','for','while','do','done','case','esac','function','in','select','until','break','continue','return','export','readonly','local','declare']),
            markdown: new Set(['#','##','###','####','#####','######']),
        };

        if (!lang || ['txt','text','plaintext'].includes(lang)) {
            return {
                codeBlock: [{ codeContent: code, highlightType: 0 }],
                unified_codeBlock: [{ content: code, type: 'DEFAULT' }],
            };
        }

        const TYPE_MAP = { 0: 'DEFAULT', 1: 'KEYWORD', 2: 'METHOD', 3: 'STR', 4: 'NUMBER', 5: 'COMMENT' };
        const keywords = keywordsMap[lang.toLowerCase()] || new Set();
        const tokens = [];
        let i = 0;

        const push = (content, type) => {
            if (!content) return;
            const last = tokens[tokens.length - 1];
            if (last && last.highlightType === type) last.codeContent += content;
            else tokens.push({ codeContent: content, highlightType: type });
        };

        const isIdentifier = (char) => {
            switch (lang.toLowerCase()) {
                case 'css': return /[a-zA-Z0-9_$-]/.test(char);
                case 'html': return /[a-zA-Z0-9_$:-]/.test(char);
                default: return /[a-zA-Z0-9_$]/.test(char);
            }
        };

        while (i < code.length) {
            const c = code[i];
            if (/\s/.test(c)) {
                let s = i;
                while (i < code.length && /\s/.test(code[i])) i++;
                push(code.slice(s, i), 0);
                continue;
            }
            if ((c === '/' && code[i + 1] === '/') || (c === '#' && ['python', 'bash'].includes(lang))) {
                let s = i;
                while (i < code.length && code[i] !== '\n') i++;
                push(code.slice(s, i), 5);
                continue;
            }
            if (c === '"' || c === "'" || c === '`') {
                let s = i; const q = c; i++;
                while (i < code.length) {
                    if (code[i] === '\\' && i + 1 < code.length) i += 2;
                    else if (code[i] === q) { i++; break; }
                    else i++;
                }
                push(code.slice(s, i), 3);
                continue;
            }
            if (/[0-9]/.test(c)) {
                let s = i;
                while (i < code.length && /[0-9._]/.test(code[i])) i++;
                push(code.slice(s, i), 4);
                continue;
            }
            if (/[a-zA-Z_$]/.test(c)) {
                let s = i;
                while (i < code.length && isIdentifier(code[i])) i++;
                const word = code.slice(s, i);
                let type = 0;
                if (keywords.has(word)) {
                    type = 1;
                } else if (lang === 'css') {
                    let j = i;
                    while (j < code.length && /\s/.test(code[j])) j++;
                    if (code[j] === ':') type = 1;
                } else if (lang === 'html') {
                    let p = s - 1;
                    while (p >= 0 && /\s/.test(code[p])) p--;
                    if (code[p] === '<' || (code[p] === '/' && code[p - 1] === '<')) type = 1;
                }
                if (type === 0) {
                    let j = i;
                    while (j < code.length && /\s/.test(code[j])) j++;
                    if (code[j] === '(') type = 2;
                }
                push(word, type);
                continue;
            }
            push(c, 0);
            i++;
        }

        return {
            codeBlock: tokens,
            unified_codeBlock: tokens.map((t) => ({ content: t.codeContent, type: TYPE_MAP[t.highlightType] })),
        };
    }

    static toTableMetadata(arr, { hyperlink = true, citation = true, latex = true } = {}) {
        if (!Array.isArray(arr) || !arr.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string')))
            throw new TypeError('Table must be a nested array of strings');

        const [header, ...rows] = arr;
        const maxLen = Math.max(header.length, ...rows.map((r) => r.length));
        const normalize = (r) => [...r, ...Array(maxLen - r.length).fill('')];

        const unified_rows = [
            { is_header: true, cells: normalize(header) },
            ...rows.map((r) => ({ is_header: false, cells: normalize(r) })),
        ].map((row) => {
            const markdown_cells = row.cells.map((cell) => {
                const extracted = Toolkit.extractIE(cell, { hyperlink, citation, latex });
                return { text: extracted.text, ...(extracted.inline_entities.length ? { inline_entities: extracted.inline_entities } : {}) };
            });
            return { ...row, ...(markdown_cells.some((c) => c.inline_entities?.length) ? { markdown_cells } : {}) };
        });

        const rowsMeta = unified_rows.map((r) => ({ items: r.cells, ...(r.is_header ? { isHeading: true } : {}) }));
        return { title: '', rows: rowsMeta, unified_rows };
    }

    static newLayout(name, data, extra = {}) {
        return { ...extra, view_model: { [Array.isArray(data) ? 'primitives' : 'primitive']: data, __typename: `GenAI${name}LayoutViewModel` } };
    }
}

/**
 * shortcut biar gak perlu `new AIRich(sock)` manual tiap kali mau bikin rich message.
 * contoh pemakaian di plugin:
 *   const rich = createAIRich(sock)
 *   await rich.setTitle('mina').addText('halo!').addSuggest(['lanjut', 'stop']).send(jid, { quoted: m.raw })
 * @param {object} client sock/client baileys aktif
 * @returns {AIRich}
 */
function createAIRich(client) {
    return new AIRich(client);
}

// ================= EXPORT =================
export { Toolkit, AIRich, createAIRich };
const VERSION = '4.7';
export { VERSION };