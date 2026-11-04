# ⚡ Arashi - Modular WhatsApp Bot Base

> **Arashi** adalah base bot WhatsApp modern berbasis **ESM (ECMAScript Modules)** dan library **Baileys**, dirancang dengan arsitektur modular yang rapi, ringan, dan mudah dikembangkan secara mandiri.

---

## ✨ Fitur Unggulan

- 🧩 **Sistem Plugin Modular Otomatis:**
  Cukup buat file `.js` baru di dalam folder `src/plugins/<kategori>/`, bot akan otomatis mendaftarkan command tanpa perlu mendaftarkannya secara manual.
- 💾 **Database Lokal Terintegrasi:**
  Menggunakan `node:sqlite` (SQLite bawaan Node.js) berkecepatan tinggi dengan mode WAL untuk ekonomi, leaderboard, dan data pengguna (`data/gamedb.db`).
- 🎮 **Game & Sistem Ekonomi:**
  Blackjack (21), Mesin Slot, Kuis Interaktif (Asah Otak, Tebak Gambar, Cak Lontong, Family 100, Teka-Teki, Susun Kata), Saldo Dompet & Bank, Leaderboard grup & global.
- 🎨 **Pesan Interaktif & Media:**
  Mendukung Native Flow Buttons, Single Select Dropdown Menu, Location Header, Carousel Image, dan konverter Stiker Animasi 1-pass WebP FFmpeg tahan corrupt.
- 🤖 **Kecerdasan Buatan (AI):**
  Integrasi assistant AI, Gemini API, Claude, DTI, dan AI coding loop.
- 🛡️ **Manajemen Grup Lengkap:**
  Jadwal otomatis buka/tutup grup harian (Open/Close schedule), antilink, welcome/goodbye kustom, broadcast, hidetag.

---

## 📁 Struktur Direktori

```text
arashi/
├── assets/                  # Asset gambar, thumbnail, dan font
├── config.js                # Konfigurasi bot (nomor, nama, API keys)
├── launcher.js              # Launcher process runner & auto-restart
├── package.json             # Dependensi & script
├── scripts/                 # Utility script pembantu
├── src/
│   ├── all-paths.js         # Mapping path terpusat
│   ├── bot.js               # Entry point socket Baileys & koneksi
│   ├── bootstrap-data.js    # Auto-inisialisasi file data pada first-run
│   ├── database/            # Helper & instance database
│   ├── event-handler/       # Event listener (messages.upsert, call, group-update)
│   ├── helper/              # Utility (converter stiker, carousel, scraper)
│   ├── manager/             # Logic manager (plugin, game, prefix, group-schedule)
│   ├── plugins/             # Folder plugin modular:
│   │   ├── ai/              # Assistant AI & LLM
│   │   ├── downloader/      # TikTok, YouTube, Instagram, Pinterest, MediaFire
│   │   ├── fun/             # Blackjack, Slot, Tic-Tac-Toe, Kuis Game
│   │   ├── group/           # Admin grup, Jadwal Buka/Tutup, Antilink
│   │   ├── info/            # Owner info, Total Fitur, Script
│   │   ├── main/            # Menu interaktif button, profile, eval
│   │   ├── maker/           # Stiker maker, Brat, QC quote generator
│   │   ├── owner/           # Command khusus owner bot
│   │   ├── random/          # Random anime, waifu, wallpaper
│   │   ├── search/          # Pencarian Google, Lirik, Gambar
│   │   └── tools/           # Utilitas konversi, pastebin, shortlink, git
│   ├── serializer/          # Serializer pesan Baileys
│   ├── store/               # In-memory contact & message store
│   └── types/               # Type definition JSDoc
└── .env.example             # Template variabel lingkungan
```

---

## 🚀 Panduan Instalasi & Menjalankan

### 1. Persyaratan Sistem
- **Node.js**: Versi `20.x` atau lebih baru (`v22+` direkomendasikan).
- **FFmpeg**: Terpasang di sistem (`sudo apt install ffmpeg`).
- **Git**: Terpasang di sistem.

### 2. Kloning Repositori
```bash
git clone https://github.com/Kadokun404/arashi.git
cd arashi
```

### 3. Pasang Dependensi
```bash
npm install
```

### 4. Konfigurasi
1. Salin `.env.example` ke `.env`:
   ```bash
   cp .env.example .env
   ```
2. Buka dan sesuaikan file `config.js`:
   - Ganti `BOT_PHONE_NUMBER` dengan nomor WhatsApp bot Anda (format: `628xxxxxxxxxx`).
   - Ganti `devNumb` dengan nomor WhatsApp owner Anda.

### 5. Jalankan Bot
```bash
# Menjalankan langsung via launcher
npm start

# Atau menggunakan PM2 untuk produksi (24/7 background)
npm install -g pm2
pm2 start launcher.js --name arashi
pm2 logs arashi
```

Pada pertama kali dijalankan, bot akan menampilkan **Pairing Code** (8 digit) di terminal. Masukkan pairing code tersebut di WhatsApp:
> **WhatsApp** > **Perangkat Tertaut (Linked Devices)** > **Tautkan dengan nomor telepon**.

---

## 🛠️ Cara Membuat Plugin Baru

Buat file baru di salah satu subfolder `src/plugins/<kategori>/<nama-plugin>.js`:

```javascript
/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * Logika utama saat command dipanggil
 * @param {PluginCtx} ctx
 */
async function run(ctx) {
    const { sock, jid, m, text, prefix, command } = ctx

    if (!text) {
        return await m.arashirep(`Halo! Kamu menjalankan command *${command}*. Masukkan teks tambahan ya!`)
    }

    await m.arashirep(`Pesan kamu: *${text}*`)
}

/** @type {PluginType} */
const plugin = {
    run,
    name: "Contoh Plugin",
    commands: ["halo", "hai"],
    categories: ["tools"],
    description: "Contoh plugin sederhana untuk developer",
    config: {
        protected: false,
        bypassPrefix: false // Set true jika command bisa dipanggil tanpa tanda titik (.)
    }
}

plugin.meta = {
    filename: "contoh.js",
    version: "1.0.0",
    author: "Nama Kamu",
    note: "Contoh plugin kustom",
    path: "tools"
}

export default plugin
```

Simpan file, dan plugin Anda langsung terdaftar ke sistem dan menu bot! 🚀

---

## 📜 Lisensi
Didistribusikan di bawah lisensi **MIT**. Bebas dikembangkan dan dimodifikasi untuk kebutuhan proyek Anda sendiri.

Dibuat dengan ❤️ oleh **[Kadokun](https://github.com/Kadokun404)**.
