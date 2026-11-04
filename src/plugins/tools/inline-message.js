/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * Fungsi untuk mengirim pesan dengan inline entity (LaTeX/Image)
 * @param {WASocket} sock - Instance socket Baileys
 * @param {string} jid - Chat ID
 * @param {object} m - Message object
 * @returns {Promise<void>}
 */
async function sendInlineMessage(sock, jid, m) {
  const submessages = [
    {
      messageType: 2,
      messageText: "Shiroko is my bini:\n- Model 1: {{NIXEL_0}}NIXCODE{{/NIXEL_0}}\n- Model 2: {{NIXEL_1}}NIXCODE{{/NIXEL_1}}"
    }
  ];

  const unified = {
    response_id: "57be79cf-d384-4122-87cc-5f76d8f32f47",
    sections: [
      {
        view_model: {
          primitive: {
            text: "Shiroko is my bini:\n- Model 1: {{NIXEL_0}}NIXCODE{{/NIXEL_0}}\n- Model 2: {{NIXEL_1}}NIXCODE{{/NIXEL_1}}",
            inline_entities: [
              {
                key: "NIXEL_0",
                metadata: {
                  latex_expression: "NIXCODE",
                  latex_image: {
                    url: "https://cdn.ornzora.eu.cc/1ca0f9a4-a81f-498e-92e8-8a4c76abf1ef-FIORA.png",
                    width: 1279,
                    height: 825
                  },
                  font_height: 83.333333333333,
                  padding: 15,
                  __typename: "GenAILatexItem"
                }
              },
              {
                key: "NIXEL_1",
                metadata: {
                  latex_expression: "NIXCODE",
                  latex_image: {
                    url: "https://cdn.ornzora.eu.cc/a3a756f2-6bb8-4814-a024-c325524a2308-FIORA.png",
                    width: 1429,
                    height: 1897
                  },
                  font_height: 83.333333333333,
                  padding: 15,
                  __typename: "GenAILatexItem"
                }
              }
            ],
            __typename: "GenAIMarkdownTextUXPrimitive"
          },
          __typename: "GenAISingleLayoutViewModel"
        }
      }
    ]
  };

  const payload = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: {
        pluginMetadata: {},
        richResponseSourcesMetadata: {}
      }
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: submessages,
          unifiedResponse: {
            data: Buffer.from(JSON.stringify(unified), "utf-8").toString("base64")
          },
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: {
              botJid: "0@bot"
            },
            forwardOrigin: 4
          }
        }
      }
    }
  };

  return sock.relayMessage(jid, payload, {});
}

/**
 * Fungsi utama plugin
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
  const { sock, jid, m } = ctx;

  await m.react("📝");

  try {
    await sendInlineMessage(sock, jid, m);
    await m.react("✅");
  } catch (error) {
    console.error("[Error - inline]:", error);
    await m.react("❌");
    await m.arashirep("❌ Gagal mengirim pesan:\n" + error.message);
  }
}

/** @type {PluginType} */
var plugin = {
  run: run,
  name: "Inline Message",
  commands: ["latex"],
  categories: ["tools"],
  description: "Mengirim pesan dengan inline entity (LaTeX/Image)"
};

plugin.meta = {
  filename: "inline-message.js",
  version: "1.0",
  author: "Kadokun",
  note: "Pesan dengan inline entity untuk LaTeX dan image",
  path: "tools"
};

plugin.config = {
  protected: false,
  bypassPrefix: false
};

export default plugin;