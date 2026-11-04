import fs from 'node:fs'
import path from 'node:path'

/**
 * baca file dan parse menjadi baileys event map
 * @param {string} fileName 
 * @returns {Promise<import("baileys").BaileysEventMap>}
 */
const readAndParse = async (fileName) => {
    const filePath = path.join(import.meta.dirname, fileName)
    const buffer = await fs.promises.readFile(filePath)
    return JSON.parse(buffer)
}

/** @param {import('baileys').WASocket} sock */
const contactEvent = async (sock) => {
    const sync4j = await readAndParse('sync4.json')
    return sock.ev.emit('messaging-history.set', sync4j['messaging-history.set'])
}

/** @param {import('baileys').WASocket} sock */
const addMemberLabel = async (sock) => {
    const sync4j = await readAndParse('add-label-member.json')
    return sock.ev.emit('messages.upsert', sync4j['messages.upsert'])
}

/** @param {import('baileys').WASocket} sock */
const removeMembeLabel = async (sock) => {
    const sync4j = await readAndParse('remove-label-member.json')
    return sock.ev.emit('messages.upsert', sync4j['messages.upsert'])
}

/** @param {import('baileys').WASocket} sock */
const groupUpsert = async (sock) => {
    const sync4j = await readAndParse('group-upsert.json')
    return sock.ev.emit('groups.upsert', sync4j['groups.upsert'])
}

const emit = {
    contactEvent,
    addMemberLabel,
    removeMembeLabel,
    groupUpsert
}

export { emit }