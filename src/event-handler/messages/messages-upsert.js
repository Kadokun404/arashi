import { notifyHandler } from "./upsert/notify-handler.js"
import { appendHandler } from "./upsert/append-handler.js"

/**
 * messages upsert handler
 * @param {import ("baileys").WASocket} sock 
 * @param {import ("baileys").BaileysEventMap['messages.upsert']} bem 
 */

const handlertMessagesUpsert = async (bem, sock) => {



    //append
    if (bem.type === "append") {
        await appendHandler(bem, sock)
    }

    // notify
    if (bem.type === "notify") {
        await notifyHandler(bem, sock)
    }
}

export { handlertMessagesUpsert }