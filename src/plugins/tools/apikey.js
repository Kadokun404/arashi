import fs from "fs"
import path from "path"
import { config } from "#root/config.js"

const ROOT = process.cwd()
const PLUGINS = path.join(ROOT, "src/plugins")
const CONFIG = path.join(ROOT, "config.js")
const BACKUP = path.join(ROOT, "cache", "backup-apikey")
const LINE = "━━━━━━━━━━━━━━━━"
const IMPORT = `import { config } from "#root/config.js"`
const TEST_URL = "https://api.theresav.eu/api/search/youtube?query=test"

const OLD = /((?:API_KEY|THERESAV_KEY)\s*=\s*|["']x-apikey["']\s*:\s*)(["'])([^"']+)\2/g
const NEW = /(?:(?:API_KEY|THERESAV_KEY)\s*=\s*|["']x-apikey["']\s*:\s*)config\.apikey\.theresav/

function walk(dir) {
    let out = []
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name)
        if (f.isDirectory()) out = out.concat(walk(p))
        else if (f.name.endsWith(".js")) out.push(p)
    }
    return out
}

function scan() {
    const legacy = []
    const migrated = []
    for (const file of walk(PLUGINS)) {
        if (path.basename(file) === "apikey.js") continue
        const src = fs.readFileSync(file, "utf8")
        const name = path.basename(file, ".js")
        OLD.lastIndex = 0
        const m = OLD.exec(src)
        if (m) legacy.push({ name, file, key: m[3] })
        else if (NEW.test(src)) migrated.push({ name, file })
    }
    return { legacy, migrated }
}

function setConfigKey(key) {
    let src = fs.readFileSync(CONFIG, "utf8")
    const has = /(apikey\s*:\s*\{[^}]*?theresav\s*:\s*)(["'])[^"']*\2/
    const block = /(apikey\s*:\s*\{)/
    const root = /(?:export\s+)?const\s+config\s*=\s*\{/

    if (has.test(src)) {
        src = src.replace(has, (_, p, q) => `${p}${q}${key}${q}`)
    } else if (block.test(src)) {
        src = src.replace(block, (_, p) => `${p}\n        theresav: "${key}",`)
    } else {
        const m = src.match(root)
        if (!m) throw new Error("struktur config.js tidak dikenali, tambahkan apikey manual")
        src = src.replace(m[0], `${m[0]}\n    apikey: {\n        theresav: "${key}"\n    },`)
    }
    fs.writeFileSync(CONFIG, src)
}

const mask = k => (!k ? "-" : k.length <= 4 ? "****" : k.slice(0, 2) + "***" + k.slice(-2))
const current = () => config?.apikey?.theresav || ""

async function run(ctx) {
    const { m, text, q } = ctx
    if (!ctx.isOwner) return

    const args = (text || q?.text || "").trim().split(/\s+/).filter(Boolean)
    const sub = (args[0] || "").toLowerCase()
    const { legacy, migrated } = scan()

    if (sub === "list") {
        const lines = [
            ...migrated.map((x, i) => `${i + 1}. ${x.name} : config.apikey.theresav`),
            ...legacy.map((x, i) => `${migrated.length + i + 1}. ${x.name} : ${mask(x.key)} (belum migrasi)`)
        ]
        if (!lines.length) return await m.arashirep("Tidak ada fitur yang memakai apikey")
        return await m.arashirep(`DAFTAR APIKEY (${lines.length})\n${LINE}\n${lines.join("\n")}`)
    }

    if (sub === "get") {
        return await m.arashirep(
`APIKEY THERESAV
${LINE}
Key      : ${mask(current())}
Config   : config.apikey.theresav
Migrasi  : ${migrated.length} fitur
Belum    : ${legacy.length} fitur`)
    }

    if (sub === "migrate") {
        if (!legacy.length) return await m.arashirep("Tidak ada key lama, semua sudah memakai config")

        const counts = {}
        for (const x of legacy) counts[x.key] = (counts[x.key] || 0) + 1
        const auto = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
        const key = args[1] || current() || auto

        const dir = path.join(BACKUP, String(Date.now()))
        fs.mkdirSync(dir, { recursive: true })
        fs.copyFileSync(CONFIG, path.join(dir, "config.js"))

        try {
            setConfigKey(key)
        } catch (e) {
            return await m.arashirep(`❌ ${e.message}`)
        }

        for (const x of legacy) {
            let src = fs.readFileSync(x.file, "utf8")
            fs.copyFileSync(x.file, path.join(dir, path.relative(ROOT, x.file).replace(/[\\/]/g, "__")))
            src = src.replace(OLD, (_, p) => `${p}config.apikey.theresav`)
            if (!/from\s+["']#root\/config\.js["']/.test(src)) src = `${IMPORT}\n${src}`
            fs.writeFileSync(x.file, src)
        }

        return await m.arashirep(
`MIGRASI SELESAI
${LINE}
Key     : ${mask(key)}
Fitur   : ${legacy.length}
${legacy.map(x => "- " + x.name).join("\n")}
${LINE}
Backup  : ${path.relative(ROOT, dir)}
Restart : pm2 restart bot-wa`)
    }

    if (sub === "rep") {
        const key = args[args.length > 2 ? 2 : 1]
        if (!key) return await m.arashirep("Contoh: apikey rep KEYBARU")
        try {
            setConfigKey(key)
        } catch (e) {
            return await m.arashirep(`❌ ${e.message}`)
        }
        return await m.arashirep(`APIKEY DIGANTI\n${LINE}\nKey     : ${mask(key)}\nRestart : pm2 restart ara`)
    }

    if (sub === "test") {
        const key = current()
        if (!key) return await m.arashirep("❌ config.apikey.theresav belum diisi")
        try {
            const res = await fetch(TEST_URL, { headers: { "x-apikey": key } })
            const j = await res.json().catch(() => ({}))
            return await m.arashirep(`TEST APIKEY\n${LINE}\ntheresav : ${j.status ? "✅ valid" : "❌ " + (j.message || "gagal")} (HTTP ${res.status})`)
        } catch (e) {
            return await m.arashirep(`TEST APIKEY\n${LINE}\ntheresav : ❌ ${e.message}`)
        }
    }

    return await m.arashirep(
`APIKEY MANAGER
${LINE}
- apikey list
- apikey get
- apikey migrate [key]
- apikey rep <keybaru>
- apikey test`)
}

const plugin = {
    run,
    name: "apikey manager",
    commands: ["apikey"],
    categories: ["tools"],
    description: "kelola apikey theresav terpusat di config.js: list, get, migrate, rep, test"
}

plugin.meta = {
    filename: "apikey.js",
    version: "4",
    author: "Kado",
    note: "apikey terpusat di config.apikey.theresav",
    path: "tools"
}

export default plugin