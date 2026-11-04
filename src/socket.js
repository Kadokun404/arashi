import makeWASocket, { fetchLatestWaWebVersion } from "baileys";

import { customAuth } from "./auth.js";
import { logger } from "./pino.js";

import { groupMetadataStore } from "./store/group-metadata-store.js";

/**@import {WASocket} from "baileys" */

/** return baileys socket
 * @return {Promise <import("baileys").WASocket>} */

const createSocket = async () => {

    // fetch latest version from wa web
    const { version, error } = await fetchLatestWaWebVersion()
    if (error) {
        console.error(`error fetch latest version baileys`, error)
    }

    const cachedGroupMetadata = (jid) => {
        return groupMetadataStore.getGroupMetadata(jid, sock)
    }

    // socket config
    const sock = makeWASocket({
        version,
        auth: customAuth.state,
        logger,
        cachedGroupMetadata
    })

    

    return sock
}

export { createSocket }