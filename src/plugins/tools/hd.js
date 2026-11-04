/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { allPaths } from "#root/src/all-paths.js";
import path from "node:path";
import fs from "node:fs";
import axios from "axios";
import FormData from "form-data";
import { config } from "#root/config.js";

// Generator IP untuk bypass limit
function generateRandomIP() {
    const r = () => Math.floor(Math.random() * 254) + 1;
    return `${r()}.${r()}.${r()}.${r()}`;
}

/**
 * @credit: ren-offc
 * @noted: don't delete the credit
 */
async function photoIhancer(imagePath, method = 1) {
    const imageBuffer = await fs.promises.readFile(imagePath);
    
    const form = new FormData();
    form.append("method", String(method));
    form.append("is_pro_version", "true");
    form.append("is_enhancing_more", "false");
    form.append("max_image_size", "high");
    form.append("file", imageBuffer, "file.jpg"); // form-data package bisa langsung menerima Buffer

    const res = await axios.post("https://ihancer.com/api/enhance", form, {
        headers: {
            ...form.getHeaders(),
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
            "Referer": "https://ihancer.com/app/"
        },
        responseType: "arraybuffer"
    });

    return Buffer.from(res.data);
}

/*
 * Created by : febry.is-a.dev
 * GitHub     : vandebry10-star
 * Date       : 08-07-2026
 * Do not remove the creator's watermark, please respect the creator.
 */
class ImgLargerUpscaler {
    constructor() {
        this.baseUrl = "https://imgupscaler.com/api/legacy";
        const randomIp = generateRandomIP();
        this.headers = {
            "Origin": "https://imgupscaler.com",
            "Referer": "https://imgupscaler.com/",
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
            "X-Client-Ipv4": randomIp,
            "X-Forwarded-For": randomIp
        };
    }

    async upload(buffer, scale = 4) {
        const form = new FormData();
        form.append("tool", "upscaler");
        form.append("mode", "batch");
        form.append("scaleRadio", String(scale));
        form.append("file", buffer, "image.jpg");

        const res = await axios.post(`${this.baseUrl}/upload`, form, {
            headers: { ...this.headers, ...form.getHeaders() },
            timeout: 30000
        });

        const taskId = res?.data?.taskId;
        if (!taskId) throw new Error("Upload failed: no taskId returned");
        return taskId;
    }

    async pollStatus(taskId, scale = 4, maxAttempts = 15, interval = 2000) {
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, interval));
            try {
                const res = await axios.post(
                    `${this.baseUrl}/status`,
                    { tool: "upscaler", taskId, scaleRadio: String(scale) },
                    { headers: { ...this.headers, "Content-Type": "application/json" }, timeout: 15000 }
                );
                
                const status = res?.data?.status;

                if (status === "success") return res.data;
                if (status === "failed" || status === "error") {
                    throw new Error(`Processing failed: ${status}`);
                }
            } catch (e) {
                if (e.message.includes("Processing failed")) throw e;
            }
        }
        throw new Error("Timeout: proses AI memakan waktu terlalu lama");
    }

    async upscale(buffer, scale = 4) {
        const taskId = await this.upload(buffer, scale);
        const result = await this.pollStatus(taskId, scale);
        
        if (!result?.downloadUrls?.[0]) {
            throw new Error("Gagal mendapatkan link hasil");
        }
        return result.downloadUrls[0];
    }
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, m, jid, q } = ctx;

    let target = null;

    if (q?.content === "imageMessage") {
        target = q;
    } else if (m.content === "imageMessage") {
        target = m;
    }

    if (!target) {
        return await m.arashirep("foto wa doko?");
    }

    await m.arashirep("humuu, matte nee, ima yarimasuu....");

    let tempFile = null;

    try {
        const buffer = await target.download("buffer");

        tempFile = path.join(allPaths.temp, `hd-${Date.now()}.jpg`);
        await fs.promises.writeFile(tempFile, buffer);

        let output;

        try {
            // primary: ihancer
            output = await photoIhancer(tempFile);
        } catch (primaryErr) {
            console.log(`[hd] ihancer gagal (${primaryErr.message}), fallback ke imglarger...`);

            // fallback: imglarger
            const upscaler = new ImgLargerUpscaler();
            const resultUrl = await upscaler.upscale(buffer, 4);
            output = { url: resultUrl };
        }

        await sock.sendMessage(
            jid,
            {
                image: output.url ? { url: output.url } : output,
                
                caption: "dekitaaaa yeyy ><",
hd: true
            },
            { quoted: m }
        );
    } catch (err) {
        await m.arashirep(`❌ *GAGAL*\n\n> ${err.message}`);
    } finally {
        if (tempFile) {
            await fs.promises.unlink(tempFile).catch(() => {});
        }
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "remini",
    commands: ["hd", "remini"],
    categories: ["tools"],
    description: "HD kan foto jadi 4K"
};

plugin.meta = {
    filename: "hd.js",
    version: "1.1.0",
    author: config.devName,
    note: "ihancer enhance (fallback: imglarger bypass IP)",
    path: "tools"
};

export default plugin;