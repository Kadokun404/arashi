/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

import { downloadContentFromMessage } from 'baileys'
import util from 'node:util'
import { config } from "#root/config.js"

function cleanCode(input = '') {
    return String(input)
        .replace(/^```(?:js|javascript)?\s*/i, '')
        .replace(/```$/i, '')
        .trim()
}

function getQuotedText(q) {
    if (!q) return ''

    if (typeof q.text === 'string' && q.text.trim()) return q.text
    if (typeof q.body === 'string' && q.body.trim()) return q.body
    if (typeof q.caption === 'string' && q.caption.trim()) return q.caption
    if (typeof q.contentText === 'string' && q.contentText.trim()) return q.contentText

    const msg = q.message || q.fullMessage?.message
    if (!msg) return ''

    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption ||
        ''
    )
}

async function streamToBuffer(stream) {
    let buffer = Buffer.from([])
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
    }
    return buffer
}

/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    if (!ctx.isOwner) return
    const { sock, m, jid, text, q } = ctx

    let code = ''

    const docMsg =
        q?.message?.documentMessage ||
        q?.fullMessage?.message?.documentMessage

    if (docMsg) {
        const isJsFile =
            /\.js$/i.test(docMsg.fileName || '') ||
            docMsg.mimetype === 'application/javascript' ||
            docMsg.mimetype === 'text/javascript'

        if (!isJsFile) {
            return await m.arashirep('```invalid js file```')
        }

        const stream = await downloadContentFromMessage(docMsg, 'document')
        const buffer = await streamToBuffer(stream)
        code = buffer.toString('utf-8')
    } else {
        const quotedText = getQuotedText(q)
        const sourceText = quotedText || text || ''
        code = cleanCode(sourceText)
    }

    if (!code.trim()) {
        return await m.arashirep('```enter code or reply js file```')
    }

    try {
        let evaled = await eval(`(async () => {
${code}
})()`)

        if (typeof evaled !== 'string') {
            evaled = util.inspect(evaled, { depth: 2 })
        }

       
    } catch (e) {
        const err = util.format(e)
        await m.arashirep(`\`\`\`js\n${err}\n\`\`\``)
    }
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "run code",
    commands: ["run"],
    categories: ["owner"],
    description: "jalanin kode js atau file .js"
}

plugin.config = {
    bypassPrefix: true
}

plugin.meta = {
    filename: "run.js",
    version: "2.5.0",
    author: config.devName,
   note: "Jawa Jawa Jawa",
    path: "owner"
}

export default plugin