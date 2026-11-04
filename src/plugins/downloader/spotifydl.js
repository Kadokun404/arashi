/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import axios from "axios";
import { config } from "#root/config.js"

/*
 * Spotify Downloader
 * API: dlapi.app
 */
class SpotifyDL {
  constructor() {
    this.api = {
      meta: "https://spotify.dlapi.app/api/Gettrack",
      convert: "https://master.dlapi.app/api/v1/convert",
      task: "https://master.dlapi.app/api/v1/tasks"
    };
    this.client = axios.create({
      headers: {
       
        Authorization: "Bearer pGLXoCsVu0hcstAecIDwlrlbcrUzv0e1cWBJ0yuB", 
        "Content-Type": "application/json",
        "User-Agent": "Spotmate/1.0"
      }
    });
  }

  valid(url) {
    return /^(https?:\/\/)?(open\.)?spotify\.com\/(track|album|playlist|artist)\/[a-zA-Z0-9]+/.test(url);
  }

  async meta(url) {
    const { data } = await this.client.get(this.api.meta, { params: { spotify_url: url } });
    if (!data) throw new Error("API Data Empty");
    return data;
  }

  async convert(url, format = "mp3") {
    const { data: init } = await this.client.post(this.api.convert, { url, format });
    if (init?.download_url) return init.download_url;
    
    const taskId = init?.task_id || init?.id;
    if (!taskId) throw new Error("No Task ID received dari server.");
    
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const { data: status } = await this.client.get(`${this.api.task}/${taskId}`);
      if (status?.status === "finished" || status?.status === "completed") {
        return status?.result?.download_url || status?.download_url;
      }
      if (status?.status === "failed") throw new Error("Gagal memproses lagu di server.");
    }
    throw new Error("Task Timeout (Terlalu lama).");
  }

  async download({ url, format = "mp3" }) {
    if (!this.valid(url)) throw new Error("URL Spotify tidak valid!");
    
    const data = await this.meta(url);
    const targetUrl = data?.external_urls?.spotify || url;
    const downloadUrl = await this.convert(targetUrl, format);
    
    return {
      title: data.name || "Unknown Title",
      artist: data.artists?.map(a => a.name).join(", ") || "Unknown Artist",
      album: data.album?.name || "Unknown Album",
      duration: data.duration_ms,
      cover: data.album?.images?.[0]?.url,
      download: downloadUrl
    };
  }
}

/**
 * Extract text dari pesan pengguna
 */
function extractText(ctx, extraNames = []) {
  const raw = String(ctx.text ?? ctx.m?.text ?? ctx.m?.body ?? "").trim();
  const prefix = ctx.prefix ?? "";
  const command = ctx.command ?? "";

  const names = [...new Set([command, ...extraNames].filter(Boolean))];
  if (!names.length) return raw;

  const prefixEscaped = prefix ? prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  const namesEscaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

  const pattern = new RegExp(`^\\s*${prefixEscaped}(${namesEscaped})\\b\\s*`, "i");
  return raw.replace(pattern, "").trim();
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
  const { m, sock, jid } = ctx;
  const link = extractText(ctx, plugin.commands);

  if (!link) {
    return await m.arashirep(
      "Kirimkan link Spotify-nya!\n\nContoh:\n.spotify https://open.spotify.com/track/..."
    );
  }

  const api = new SpotifyDL();

  if (!api.valid(link)) {
    return await m.arashirep("Link Spotify yang diberikan sepertinya tidak valid. Pastikan itu adalah link track, album, atau playlist.");
  }

  await m.arashirep("Memproses lagu dari Spotify... Tunggu sebentar ya.");

  try {
    const result = await api.download({ url: link });

    // Format Caption
    let caption = `🎧 *SPOTIFY DOWNLOADER*\n\n`;
    caption += `*Judul:* ${result.title}\n`;
    caption += `*Artis:* ${result.artist}\n`;
    if (result.album) caption += `*Album:* ${result.album}\n`;
    caption += `\n_Sedang mengirim audio..._`;

    // 1. Kirim Cover + Informasi
    if (result.cover) {
      await sock.sendMessage(jid, {
        image: { url: result.cover },
        caption: caption
      }, { quoted: m });
    } else {
      await m.arashirep(caption);
    }

    // 2. Kirim Audio
    await sock.sendMessage(jid, {
      audio: { url: result.download },
      mimetype: 'audio/mpeg',
      fileName: `${result.title} - ${result.artist}.mp3`
    }, { quoted: m });

  } catch (err) {
    await m.arashirep(`Maaf, terjadi kesalahan saat mendownload:\n${err.message}`);
  }
}

/**
 * @type {PluginType}
 */
const plugin = {
  run,
  name: "spotify",
  commands: ["spoti", "spdl", "spotifydl"],
  categories: ["downloader"],
  description: "Download lagu dari Spotify via link"
};

plugin.meta = {
  filename: "spotifydl.js",
  version: "1.0.0",
  author: config.devName,
  note: "Spotify Downloader Plugin",
  path: "downloader"
};

export default plugin;