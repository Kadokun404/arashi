/**
 * @import {PluginCtx, PluginType} from "../types/types.js"
 */


/**
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, jid, text } = ctx

    const rawContent = {
  "extendedTextMessage": {
    "text": "https://github.com/Kadokun404/base-ruina-md\njangan lupa star nyaa 😳💐",
    "matchedText": "https://github.com/Kadokun404/base-ruina-md",
    "description": "Ruina Multi Device",
    "title": "Tekan Gambar Di atas Untuk Dapetin Sourcenya!",
    "previewType": "NONE",
"jpegThumbnail": "/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAgACADASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAgMEBQb/xAAsEAACAgEDAgQEBwAAAAAAAAABAgMRBAASIQUTIjFBUQZxofEUI2GBkbHB/8QAFgEBAQEAAAAAAAAAAAAAAAAAAgED/8QAHBEAAgIDAQEAAAAAAAAAAAAAAQIAEQMEEiJB/9oADAMBAAIRAxEAPwC2bIXb3VRY3B4VSfP0POgcL3A8tTTHly/v7ahy5Cr+DcFufGwbzFD10g5W528VVzWntH1yPk31lAHRlmiIxG1FididjrwD+3z0M4bLhUrJ26O11Pobo/xpGRkmCHDxzCwm298vdeEn7aBZzLLkoAtKd9/MaWqxVwDBnAZSRInUNm+NkYEbm9+BXB/vVl0tMbMwhkqidjFW3SMbpHevX9PYaTk9Ny86F5O3sFEWWB59r0r4fgC5+zCkMUjxgSBHLEEEi6Ppf+6uVe2LXCjcqFqaDr02OOkF3FMyEIpq+Ofp56yuLGWzZGZ9oVas+vF19NaDrXTQmHkZeSyySNjrDTXSmxdV7kDUXA6LIsMiZMn5gSNloXYPmfnxX30cVI4Yyk2hWf/Z",
    "thumbnailDirectPath": "/o1/v/t24/f2/m234/AQM1FkqXXkaa2xJnt_MlFI5ptTF9JJicrlSDVZ4faPhzNKwzDHqSxmQoLM0l0PT0pOzuhzv_IbkOQqKPu0pMNftwjd7U5fbThbDc38YjCw?ccb=9-4&oh=01_Q5Aa5AFdxH5yRtaWPKKaonPmyANxTDQRgWqfq_DQtyjcBNkYhw&oe=6A8575F2&_nc_sid=e6ed6c",
    "thumbnailSha256": "PbCfoutPDbAA+7MDXgl6dY00zY2gLEjZKm5N2THZlb0=",
    "thumbnailEncSha256": "zjrYRrMRFQgWNsOA3wwbCP7NSuTh9lEYElmaxdDNAXc=",
    "mediaKey": "jpFVNUHDwYu9cVoq6LBvr36sAEbW/yawto3s92o8qig=",
    "mediaKeyTimestamp": "1784541904",
    "thumbnailHeight": 1600,
    "thumbnailWidth": 1600,
    "inviteLinkGroupTypeV2": "DEFAULT",
    "faviconMMSMetadata": {
      "thumbnailDirectPath": "/o1/v/t24/f2/m238/AQPLOgf94kGOkYvr4Tjk7QNj98UzTy3AiB1vDgTuW6Kcc157deFOzYt9FweOjtbk02adipHH37n93mn5x9goMl_QJOpdHDH18KML5qmjrQ?ccb=9-4&oh=01_Q5Aa5AEtTXH22rDiR5P3E4ttGHDrJgopIq1lXyks6wSgtN1yVg&oe=6A855F5B&_nc_sid=e6ed6c",
      "thumbnailSha256": "4CRBPEsYvCFcVbIuadekwU98rK+SXQtKacjl/c9xh5g=",
      "thumbnailEncSha256": "9yi3WbbdvRhGtK1fuKZruO2rQIWIxM9qMDHbEARomiI=",
      "mediaKey": "b8I23VnJpY9vNz2UfiWi6CnJhEdROY6xUtHJbo+PhG8=",
      "mediaKeyTimestamp": "1784540664",
      "thumbnailHeight": 64,
      "thumbnailWidth": 64
    }
  },
  "messageContextInfo": {
    "messageSecret": "7NMdRI3OunzKwa6w3Tc9vlZzxMkn6CdnwLn5S3IfzUQ="
  }
};

function reviveBuffers(obj) {
  if (obj && typeof obj === 'object') {
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return Buffer.from(obj.data);
    }
    for (let k in obj) {
      obj[k] = reviveBuffers(obj[k]);
    }
  }
  return obj;
}

const content = reviveBuffers(rawContent);

const relayOptions = {
  messageId: "PP" + Date.now(),
  // participant: "",
};

await sock.relayMessage(jid, content, relayOptions);
    
}

/**
 * @type {PluginType}
 */
const plugin = {
    run,
    name: "repo link preview",
    commands: ["sc"],
    categories: ["info"],
    description: "kirim link preview repo base-ruina-md, thumbnail opsional lewat argumen link gambar"
}

plugin.meta = {
    filename: "sc.js",
    version: "2",
    author: "Kado",
    note: "ex",
    path: "info"
}

export default plugin