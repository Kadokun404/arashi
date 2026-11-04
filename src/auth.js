import { makeCacheableSignalKeyStore, useMultiFileAuthState } from "baileys";
import { allPaths } from "./all-paths.js";
import fs from "node:fs";

/**
 * todo : buat custom auth
 * @param {string} folderPath folder path for store auth
 * @returns {Promise <
 * {
 * state: import("baileys").AuthenticationState,
 * saveCreds: () => Promise<void>
 * }}
 */

const auth = async (folderPath) => {
    console.log('init auth')

    // auto mkdir folder auth biar ga error pas baileys nyari folder auth nya
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true })
        console.log(`[auth] folder "${folderPath}" belum ada, otomatis dibuat`)
    }

    const { saveCreds, state: _state } = await useMultiFileAuthState(folderPath)
    const state = {
        keys : makeCacheableSignalKeyStore(_state.keys),
        creds : _state.creds
    }
    return { saveCreds, state }
}

const customAuth = await auth("./auth")

export { customAuth }