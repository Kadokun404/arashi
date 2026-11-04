/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import crypto from 'node:crypto';
import { config } from "#root/config.js";

const base_url = 'https://www.chatday.ai';
const baseHeaders = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
  'Origin': base_url,
  'Referer': `${base_url}/chat`,
};

// session cuma di simpen di memory (per senderId), sengaja gak di tulis ke
// disk lagi biar gak ngasilin file data/haiku-chat.json. konsekuensinya
// session bakal ilang tiap kali bot restart, tapi itu gapapa toh cuma
// nyambungin history percakapan chatday.ai aja
const userSessions = {};

async function signInAnonymous() {
  const r = await fetch(`${base_url}/api/auth/sign-in/anonymous`, {
    method: 'POST',
    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`Gagal terhubung ke server AI (Auth). Status: ${r.status}. Respon: ${errText}`);
  }

  const setCookie = r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie')].filter(Boolean);
  const cookie = setCookie.map(c => c.split(';')[0]).join('; ');
  const data = await r.json();
  
  return { cookie, token: data.token, user: data.user };
}

async function chatHaiku(prompt, senderId) {
  // Menggunakan Haiku 4.5
  const model = 'anthropic/claude-haiku-4.5'; 
  
  let session = userSessions[senderId];
  if (!session) {
    const auth = await signInAnonymous();
    session = {
      cookie: auth.cookie,
      visitorId: crypto.randomUUID().replace(/-/g, ''),
      conversationId: Math.random().toString(36).slice(2, 10).toUpperCase() + Math.random().toString(36).slice(2, 10).toUpperCase()
    };
    userSessions[senderId] = session;
  }

  const r = await fetch(`${base_url}/api/v2/chat/anonymous`, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/json',
      'Cookie': session.cookie,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({ 
      content: prompt, 
      model, 
      visitorId: session.visitorId, 
      conversationId: session.conversationId 
    }),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`Server menolak permintaan (Status: ${r.status}). \nDetail:\n${errText}`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === 'text-delta' && typeof evt.delta === 'string') {
          full += evt.delta;
        }
      } catch {}
    }
  }
  
  return full;
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
  let prompt = extractText(ctx, plugin.commands);
  const senderId = m.sender || m.key?.remoteJid || "anonymous_user";

  const quotedText = q?.text || q?.body || m?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || "";
  if (quotedText) {
    prompt = `[Pesan rujukan: "${quotedText}"]\n\nPertanyaan: ${prompt}`;
  }

  if (!prompt) {
    return await m.arashirep(
      "Halo! Saya Claude Haiku. Ada yang bisa saya bantu hari ini?"
    );
  }

  try {
    const response = await chatHaiku(prompt, senderId);
    
    if (!response) {
      throw new Error("Respon kosong dari server AI.");
    }

    await m.arashirep(response);
  } catch (err) {
    if (userSessions[senderId]) {
      delete userSessions[senderId];
    }
    
    const errorDetails = err.stack || err.message || String(err);
    await m.arashirep(`*[CLAUDE ERROR]* ⚠️\nTerjadi kesalahan sistem, sesi kamu telah direset.\n\n*Log Error:*\n\`\`\`${errorDetails}\`\`\``);
  }
}

/**
 * @type {PluginType}
 */
const plugin = {
  run,
  name: "claude-haiku",
  commands: ["claudehaiku", "haiku"],
  categories: ["ai"],
  description: "Chat dengan Anthropic Claude Haiku 4.5 (Mendukung Session & Reply)"
};

plugin.meta = {
  filename: "claude-haiku-4-5.js",
  version: "1.0.0",
  author: config.devName,
  note: "Claude Haiku AI implementation, session cuma di memory (gak nulis data/haiku-chat.json lagi)",
  path: "ai"
};

export default plugin;