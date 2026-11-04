/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q, text } = ctx

    const query = (text || q?.text || "").trim()


    await m.arashirep("chotto matte ne, ima sagashitemasu...")

    try {
       
        const resLirik = await fetch(`https://www.keyrafara.com/search/lyrics?q=${query}`)
        
        if (!resLirik.ok) throw new Error(`HTTP Error: ${resLirik.status}`)
        
        const jsonLirik = await resLirik.json()

        if (!jsonLirik.status || !jsonLirik.result) {
            return await m.arashirep("gomen ne, lirik lagunya tidak ditemukan.")
        }

        const { title, artist, thumbnail, spotify_url, lyrics } = jsonLirik.result
        const plainLyrics = lyrics?.plain_lyrics || "Lirik tidak tersedia."

        let caption = `🎵 *${title}* - ${artist}\n`
        if (spotify_url) caption += `🔗 Spotify: ${spotify_url}\n`
        caption += `\n---\n\n${plainLyrics}`

        if (thumbnail) {
            await sock.sendMessage(
                jid,
                {
                    image: { url: thumbnail },
                    caption: caption
                },
                { quoted: m.raw || m }
            )
        } else {
            await m.arashirep(caption)
        }

        if (spotify_url) {
            
            const encSpotifyUrl = encodeURIComponent(spotify_url)
            const resAudio = await fetch(`https://www.keyrafara.com/downloaders/spotify?url=${encSpotifyUrl}`)
            
            if (resAudio.ok) {
                const jsonAudio = await resAudio.json()
                
                if (jsonAudio.status && jsonAudio.result?.url) {
                    await sock.sendMessage(
                        jid,
                        {
                            audio: { url: jsonAudio.result.url },
                            mimetype: 'audio/mpeg',
                            ptt: false,
                            fileName: `${title} - ${artist}.mp3`
                        },
                        { quoted: m.raw || m }
                    )
                }
            }
        }

    } catch (err) {
        await m.arashirep(`erā ga hassei shimashita:\n${err.message}`)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "Lirik Lagu",
    commands: ["lirik", "lyrics", "lagu"],
    categories: ["search"],
    description: "Mencari lirik lagu beserta audio."
}

plugin.meta = {
    filename: "lirik.js",
    version: "1.1.0",
    author: "Kado",
    note: "menggunakan api keyrafara lirik & spotify",
    path: "search"
}

export default plugin