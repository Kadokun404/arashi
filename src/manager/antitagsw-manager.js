import fs from "fs"
import path from "path"

const FILE = path.join(process.cwd(), "data", "antitagsw.json")
fs.mkdirSync(path.dirname(FILE), { recursive: true })

let enabled = new Set()
try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"))
    enabled = new Set(Array.isArray(raw) ? raw : [])
} catch {}

const save = () => fs.writeFileSync(FILE, JSON.stringify([...enabled]))

class AntiTagSwManager {
    isEnabled(jid) {
        return enabled.has(jid)
    }
    enable(jid) {
        enabled.add(jid)
        save()
    }
    disable(jid) {
        enabled.delete(jid)
        save()
    }
}

export const antiTagSwManager = new AntiTagSwManager()
