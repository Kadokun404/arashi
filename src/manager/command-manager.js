/**
 * @import {prefixResult} from "./prefix-manager.js"
 */

/**
 * @typedef {object} commandResult
 * @property {string} command string pertama
 * @property {string|undefined} data string tanpa command, kalau kosong akan undefined
 * 
 */

/**
 * 
 * @param {prefixResult} prefixResult 
 * @returns {commandResult|undefined}
 */

let resolveCommand = (prefixResult) => {
    if (!prefixResult) return undefined
    if (!prefixResult?.data) return undefined

    const raw = prefixResult.data
    const specialSymbols = ["=>", ">>", "!>", "!!", "!", ">", "$"]
    for (const sym of specialSymbols) {
        if (raw.startsWith(sym)) {
            const rest = raw.slice(sym.length)
            if (rest.startsWith(" ") || rest.length === 0 || /^[a-zA-Z0-9_({['"`]/.test(rest)) {
                return {
                    command: sym,
                    data: rest.trimStart() || undefined
                }
            }
        }
    }

    const command = getFirstString(prefixResult.data)
    const data = prefixResult.data.slice(command?.length + 1) || undefined
    return {
        command,
        data
    }
}

let getFirstString = (text) => {
    const end = text.search(/\s/)
    return end === -1 ? text : text.slice(0, end)
}


export { resolveCommand }
