# ⚡ Arashi - Modular WhatsApp Bot Base

> **Arashi** adalah base bot WhatsApp kosongan berbasis **ESM (ECMAScript Modules)** dan library **Baileys**, dirancang sebagai pondasi bersih, ringan, dan modular agar developer dapat mengembangkan fitur dan ekosistem bot mereka sendiri secara leluasa.

---

## 🎯 Mengapa Memilih Base Ini?

- 📦 **Base Bersih & Minimalis:**
  Bebas dari ratusan plugin bawaan yang berat. Hanya menyertakan fitur inti esensial untuk developer:
  - `!` / `>`: Eval JavaScript biasa
  - `!!` / `=>`: Eval JavaScript Async/Await
  - `$`: Terminal Shell Executor
  - `menu` / `help`: Menu berbasis teks bersih & dinamis
  - `ping`: Contoh plugin starter
- 🧩 **Sistem Plugin Modular Otomatis:**
  Cukup buat file baru di `src/plugins/<kategori>/<nama-fitur>.js`. Bot akan otomatis me-load command ke sistem tanpa perlu mendaftarkannya secara manual ke router/dispatcher.
- ⚙️ **Konfigurasi Fleksibel & Terpusat (`config.js`):**
  Mendukung penambahan API key dan konfigurasi khusus sesuai kebutuhan proyek kamu.
- 🚀 **Lifecycle Launcher:**
  Dilengkapi `launcher.js` yang menjaga proses bot tetap berjalan stabil serta menangani graceful shutdown & restart.

---

## 📁 Struktur Direktori

```text
arashi/
├── config.js                # Konfigurasi bot (nomor, API keys, owner)
├── launcher.js              # Launcher process runner
├── package.json             # Dependensi & script bot
├── .env.example             # Template variabel lingkungan
├── .gitignore               # Proteksi credential & file database
├── data/                    # Penyimpanan data runtime (auto-generate)
├── src/
│   ├── all-paths.js         # Mapping path terpusat
│   ├── bot.js               # Entry point socket Baileys
│   ├── bootstrap-data.js    # Auto-inisialisasi data pada first-run
│   ├── database/            # Store & database helper
│   ├── event-handler/       # Event listener (pesan masuk, koneksi, dll)
│   ├── helper/              # Utility & fungsi pembantu
│   ├── manager/             # Logic manager (plugin, prefix, menu)
│   ├── plugins/             # Folder plugin buatanmu:
│   │   ├── example/         # Contoh plugin (ping.js)
│   │   ├── main/            # Eval, Eval Async, Menu
│   │   └── owner/           # Shell command ($)
│   ├── serializer/          # Serializer pesan Baileys
│   ├── store/               # In-memory store
│   └── types/               # Type definition JSDoc
```

---

## 🚀 Panduan Memulai

### 1. Kloning Repositori
```bash
git clone https://github.com/Kadokun404/arashi.git
cd arashi
```

### 2. Pasang Dependensi
```bash
npm install
```

### 3. Konfigurasi Bot (`config.js` & `.env`)
1. Salin `.env.example` ke `.env`:
   ```bash
   cp .env.example .env
   ```
2. Buka `config.js` dan masukkan nomor WhatsApp bot Anda di bagian `BOT_PHONE_NUMBER` dan nomor owner di `devNumb`.
3. **Menambahkan API Key Baru:**
   Di file `config.js`, kamu bisa bebas menambahkan API key baru untuk fitur-fitur yang kamu buat:
   ```javascript
   config.apikey = {
       github: process.env.GITHUB_API_KEY || "",
       myapikey: process.env.MY_API_KEY || "isi_key_kamu_disini",
       openai: process.env.OPENAI_API_KEY || ""
   }
   ```
   Lalu di plugin kamu, cukup panggil:
   ```javascript
   import { config } from "#root/config.js"
   const apiKey = config.apikey.myapikey
   ```

### 4. Jalankan Bot
```bash
npm start
```
Masukkan 8 digit **Pairing Code** yang muncul di terminal pada aplikasi WhatsApp kamu (**Perangkat Tertaut > Tautkan dengan nomor telepon**).

---

## 🛠️ Cara Membuat Plugin Baru

Buat file baru di `src/plugins/<kategori>/<nama-fitur>.js`, misalnya `src/plugins/tools/halo.js`:

```javascript
/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * Logika utama saat perintah dipanggil
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { m, text, command } = ctx

    if (!text) {
        return await m.arashirep(`Halo! Kamu mengetik perintah *${command}*. Masukkan pesan tambahan ya!`)
    }

    await m.arashirep(`Pesan kamu: *${text}*`)
}

/** @type {PluginType} */
const plugin = {
    run,
    name: "Halo Plugin",
    commands: ["halo", "hai"],
    categories: ["tools"],
    description: "Contoh plugin dasar"
}

plugin.meta = {
    filename: "halo.js",
    version: "1.0.0",
    author: "Nama Kamu",
    note: "Plugin kustom",
    path: "tools"
}

export default plugin
```

Simpan file, dan perintah `.halo` langsung aktif serta otomatis muncul di menu! 🎉

---

## 📜 Lisensi
Didistribusikan di bawah lisensi **MIT**. Bebas dikembangkan dan dimodifikasi untuk kebutuhan proyek Anda sendiri.

Dibuat dengan ❤️ oleh **[Kadokun](https://github.com/Kadokun404)**.
