import fs from "node:fs"

import { delay, DisconnectReason } from "baileys";
import qrTerminal from 'qrcode-terminal'

import { config } from "#root/config.js";
import { allPaths } from "#core/all-paths.js";

const { BOT_PHONE_NUMBER, PAIRING_CODE } = config
let gotCode = false

/**
 * handler for connection-update
 * @param {import("baileys").ConnectionState} bem connection value
 * @param {import("baileys").WASocket} sock socket
 * @param {Promise <void>} startSock for restart new socket
 */

const handlerConnectionUpdate = async (bem, sock, startSock) => {
    
    const { connection, lastDisconnect, qr, receivedPendingNotifications } = bem
    if (connection === "close") {
        const logout = lastDisconnect?.error?.output?.statusCode == DisconnectReason.loggedOut;
        if (logout) {
            await fs.promises.rm(allPaths.baileysAuth, {
                recursive: true,
                force: true
            })
            console.error('logout, auth deleted')
        }

        else {
            console.warn('connection clodes check log, restart in 5 sec', bem)
            await delay(5000)
            await startSock()
        }
    }

    if (connection === 'open') {
        console.log('koneksi open')

        // cek ada flag restart apa engga (di tulis sama plugin owner-restart.js),
        // kalau ada berarti bot baru aja restart -> kasih tau ke chat yang minta restart
        try {
            if (fs.existsSync(allPaths.restartFlag)) {
                const raw = await fs.promises.readFile(allPaths.restartFlag, 'utf-8')
                await fs.promises.rm(allPaths.restartFlag, { force: true })

                const { jid } = JSON.parse(raw || '{}')
                if (jid) {
                    await sock.sendMessage(jid, { text: 'minaa bangkit kembalii, siap bermain kado?' })
                }
            }
        } catch (err) {
            console.error('[restart] gagal ngirim pesan abis restart', err)
        }
    }

    if (qr) {
        // qr print
        qrTerminal.generate(qr, { small: true })

        // // logic pairing code
        if (!gotCode) {
            const code = await sock.requestPairingCode(BOT_PHONE_NUMBER, PAIRING_CODE);
            console.log(`code ${code.match(/.{4}/g).join("-")} sent to ${BOT_PHONE_NUMBER}`);
            gotCode = true;
        }
    }

    if (receivedPendingNotifications){
        console.log("LETS GO!")
    }
}

export { handlerConnectionUpdate }