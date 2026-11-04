import { config } from "#root/config.js"
/**
 * 
 * @param {Array} arr 
 * @returns {any|undefined}
 */
const getOneRandomElemenFrom = arr => {
    if (!Array.isArray(arr)) return undefined
    return arr[Math.floor(Math.random() * arr.length)]
}
/**
 * misahin kata pertama sama sisanya dari sebuah string, gunanya buat misahin
 * "nama-kategori sisanya blabla" jadi { firstString: "nama-kategori", restString: "sisanya blabla" }
 * @param {string} string
 * @returns {{firstString: string|undefined, restString: string|undefined}}
 */
const getFirstStringAndRest = (string) => {
    if (typeof string !== "string") return {
        firstString: undefined,
        restString: undefined
    }

    const trimmed = string.trim()
    if (!trimmed) return {
        firstString: undefined,
        restString: undefined
    }

    const spaceIndex = trimmed.indexOf(' ')
    if (spaceIndex === -1) return {
        firstString: trimmed,
        restString: undefined
    }

    return {
        firstString: trimmed.slice(0, spaceIndex),
        restString: trimmed.slice(spaceIndex + 1).trim() || undefined
    }
}

const getRandomElementFrom = arr => arr[Math.floor(Math.random()*arr.length)]

const formatter = Intl.DateTimeFormat("id-ID", {
    timeZone: config.TIME_ZONE,
    timeZoneName: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
})

const humanTimeFromSecond = (second) => {
    if (!second) return undefined
    return formatter.format(second*1000)
}
/**
 * fungsi buat normalize timestamp, ya baileys kadang return object long jir, jadi musti di normalize kan
 * fungsi ini return undefined kalau param nya ngaco
 * @param {Long|number|undefined} param objek long
 * @returns {number|undefined} 
 */
const longNormalizer = (param) => {

    if (typeof (param?.toInt) === "function") {
        return param?.toInt()
    } else if (typeof (param) === "number") {
        return param
    } else {
        return undefined
    }
}

const toJsObject = (input) => ({ ...input })


export {
    getRandomElementFrom,
    longNormalizer,
    toJsObject,
    humanTimeFromSecond,
    getOneRandomElemenFrom,
    getFirstStringAndRest
}

