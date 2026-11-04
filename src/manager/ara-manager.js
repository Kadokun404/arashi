import fs from "fs"
import path from "path"

const FILE = path.join(process.cwd(), "data", "ara.json")
fs.mkdirSync(path.dirname(FILE), { recursive: true })

let store = {}
try { store = JSON.parse(fs.readFileSync(FILE, "utf8")) } catch {}
const save = () => fs.writeFileSync(FILE, JSON.stringify(store))

const key = (jid, sender) => `${jid}:${sender}`

class AraManager {
    isActive(jid, sender) {
        return !!store[key(jid, sender)]?.active
    }
    get(jid, sender) {
        return store[key(jid, sender)]
    }
    set(jid, sender, data) {
        store[key(jid, sender)] = { ...store[key(jid, sender)], ...data }
        save()
    }
    clear(jid, sender) {
        delete store[key(jid, sender)]
        save()
    }
}

export const araManager = new AraManager()
