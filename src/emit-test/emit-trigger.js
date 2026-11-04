import fs from 'node:fs'

/**
 * baca file dan parse menjadi baileys event map
 * @param {string} path 
 * @returns {import("baileys").BaileysEventMap}
 */
const readAndParse = async (path) => {
    const buffer = await fs.promises.readFile('./emit-test/group-upsert.json')
    return JSON.parse(buffer)
}


/** @param {import('baileys').WASocket} sock */
const contactEvent = async (sock) => {
    const sync4f = await fs.promises.readFile('./emit-test/sync4.json')

    /**@type {import ("baileys").BaileysEventMap} sync4j */
    const sync4j = JSON.parse(sync4f)
    return sock.ev.emit('messaging-history.set', sync4j['messaging-history.set'])
}

/** @param {import('baileys').WASocket} sock */
const addMemberLabel = async (sock) => {
    const sync4f = await fs.promises.readFile('./emit-test/add-label-member.json')

    /**@type {import ("baileys").BaileysEventMap} sync4j */
    const sync4j = JSON.parse(sync4f)
    return sock.ev.emit('messages.upsert', sync4j['messages.upsert'])
}

/** @param {import('baileys').WASocket} sock */
const removeMembeLabel = async (sock) => {
    const sync4f = await fs.promises.readFile('./emit-test/remove-label-member.json')

    /**@type {import ("baileys").BaileysEventMap} sync4j */
    const sync4j = JSON.parse(sync4f)
    return sock.ev.emit('messages.upsert', sync4j['messages.upsert'])
}



/** @param {import('baileys').WASocket} sock */
const groupUpsert = async (sock) => {
    const sync4j = await readAndParse('./emit-test/group-upsert.json')
    return sock.ev.emit('groups.upsert', sync4j['groups.upsert'])
}


const emit = {
    contactEvent,
    addMemberLabel,
    removeMembeLabel,
    groupUpsert
}

export { emit }