/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import axios from "axios";
import { config } from "#root/config.js";

/*
 * DTI / Describe This Image
 */
class ImageDescriber {
  constructor() {
    this.askmeUrl = "https://askme.matlubapps.com/ask-me";
    this.askmeKey = "ak8asda9$5kpq";
    this.askmeModel = "gpt_4__1_nano";
    this.history = [];
    this.systemPrompt = "Kamu adalah AI asisten yang sangat ahli dalam melihat, menganalisis, dan mendeskripsikan gambar. Jelaskan gambar yang diberikan secara detail dan akurat menggunakan bahasa Indonesia.";
  }

  async resolveMedia(input) {
    if (!input) return "";
    if (Buffer.isBuffer(input)) return input.toString("base64");
    if (typeof input === "string") {
      if (input.startsWith("http://") || input.startsWith("https://")) {
        const { data } = await axios.get(input, { responseType: "arraybuffer", timeout: 30000 });
        return Buffer.from(data).toString("base64");
      }
      if (input.startsWith("data:")) return input.split(",")[1];
      return input;
    }
    return "";
  }

  async chatImage(prompt, image) {
    const b64 = await this.resolveMedia(image);
    
    if (this.history.length === 0) {
      this.history.push({ role: "system", content: this.systemPrompt });
    }

    this.history.push({ role: "user", content: prompt, data: b64 });

    const { data } = await axios.post(this.askmeUrl, {
      history: this.history,
      isPremium: false,
      modelname: this.askmeModel,
    }, {
      headers: { "Content-Type": "application/json", key: this.askmeKey },
      timeout: 60000,
    });

    const reply = data.msg || data.text;
    if (!reply) throw new Error("Tidak ada respon dari server AskMe.");

    this.history.push({ role: "assistant", content: reply, data: "" });
    return { code: 200, msg: reply };
  }
}

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
  const { m, q } = ctx;
  const prompt = extractText(ctx, plugin.commands);

  let imageTarget = null;
  if (q?.content === "imageMessage") {
    imageTarget = q;
  } else if (m?.content === "imageMessage") {
    imageTarget = m;
  }

  if (!imageTarget) {
    return await m.arashirep(
      "Kirimkan gambar dengan caption, atau balas (reply) gambar dengan perintah:\n.dti tolong jelaskan gambar ini"
    );
  }

  try {
    const ai = new ImageDescriber();
    const imageBuffer = await imageTarget.download("buffer");
    const userPrompt = prompt || "Tolong deskripsikan gambar ini dengan detail.";

    await m.arashirep("Sedang menganalisis gambar...");
    const result = await ai.chatImage(userPrompt, imageBuffer);

    if (!result.msg) throw new Error("Gagal mendeskripsikan gambar.");
    await m.arashirep(result.msg);
  } catch (err) {
    await m.arashirep(`Maaf... terjadi kesalahan:\n${err.message}`);
  }
}

/**
 * @type {PluginType}
 */
const plugin = {
  run,
  name: "descthisimage",
  commands: ["dti", "descthisimage"],
  categories: ["ai"],
  description: "Deskripsikan gambar menggunakan AI"
};

plugin.meta = {
  filename: "dti.js",
  version: "1.0.0",
  author: config.devName,
  note: "Image Description AI",
  path: "ai"
};

export default plugin;