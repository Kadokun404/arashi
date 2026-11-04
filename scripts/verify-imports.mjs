// Usage: node scripts/verify-imports.mjs [--runtime] [--facades=a,b]
// Statis: resolve semua specifier relatif/#alias di src/, plugins, scripts, launcher.js, config.js.
// --runtime: juga import() tiap file di src/ (bisa punya side effect; pakai hati-hati).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
const aliases = Object.entries(pkg.imports || {}).map(([k, v]) => [k.replace("*", ""), v.replace("*", "")])
const facadeRe = /^\s*export\s+(\*|\{\s*default\s*\})\s+(from\s+)?["'][^"']+["'];?\s*$/
const skip = new Set(["node_modules", ".git", "auth", "data", "cache", "temp", "assets"])

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip.has(e.name)) continue
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(m?js)$/.test(e.name)) out.push(p)
  }
  return out
}
const isFacade = f => {
  const lines = fs.readFileSync(f, "utf8").split("\n").filter(l => l.trim())
  return lines.length > 0 && lines.length <= 2 && lines.every(l => facadeRe.test(l))
}
const files = [...walk(path.join(root, "src")), ...walk(path.join(root, "scripts")),
  ...["launcher.js", "config.js"].map(f => path.join(root, f)).filter(fs.existsSync)]
  .filter(f => !f.endsWith("verify-imports.mjs") && !f.endsWith("refactor_imports.py"))

const re = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+|@import\s*\{[^}]*\}\s*from\s*)["']([^"']+)["']/gm
const bad = [], viaFacade = []
for (const f of files) {
  const src = fs.readFileSync(f, "utf8")
  for (const m of src.matchAll(re)) {
    const spec = m[1]
    let target
    if (spec.startsWith(".")) target = path.resolve(path.dirname(f), spec)
    else {
      const a = aliases.find(([k]) => spec.startsWith(k))
      if (!a) continue // package bare
      target = path.resolve(root, a[1], spec.slice(a[0].length))
    }
    const line = src.slice(0, m.index).split("\n").length
    const comment = /^\s*(\*|\/\/)/.test(src.split("\n")[line - 1] || "")
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) bad.push(`${path.relative(root, f)}:${line} -> ${spec}${comment ? " (komentar/JSDoc)" : ""}`)
    else if (isFacade(target)) viaFacade.push(`${path.relative(root, f)}:${line} -> ${spec}`)
  }
}
console.log(`Static scan: ${files.length} file`)
console.log(`Unresolved (${bad.length}):\n${bad.join("\n") || "  -"}`)
console.log(`Masih lewat facade (${viaFacade.length}):\n${viaFacade.join("\n") || "  -"}`)

if (process.argv.includes("--runtime")) {
  const fails = []
  for (const f of walk(path.join(root, "src"))) {
    if (f.endsWith("src/bot.js")) continue // entry: akan konek WA
    try { await import(pathToFileURL(f).href) }
    catch (e) { fails.push(`${path.relative(root, f)}: ${e.code || e.name}: ${e.message.split("\n")[0]}`) }
  }
  console.log(`Runtime import gagal (${fails.length}):\n${fails.join("\n") || "  -"}`)
  process.exit(0)
}
process.exit(bad.length || viaFacade.length ? 1 : 0)
