# Arashi

Base bot WhatsApp (Baileys) yang modular, tanpa plugin bawaan.

```
src/
  core/           socket, auth, bootstrap, pino, plugin verifikator
  event-handler/  connection, creds, group, messages
  serializer/     parsing pesan, kontak, quoted, tombol
  database/ store/  penyimpanan & cache
  manager/        logic bot (group/, system/, dll)
  helper/         canvas, media, message, services, utils
  plugins/        taruh plugin di sini (subfolder = kategori)
```

## Mulai
1. `npm install`
2. `cp .env.example .env` lalu isi
3. `npm start`

Import pakai alias `#core/*`, `#helper/*`, `#manager/*`, dst. (lihat `package.json`).
