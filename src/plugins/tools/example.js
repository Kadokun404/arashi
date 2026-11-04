/**
 * @import {PluginCtx, PluginType} from "../../types/types.js"
 */

/**
 * Fungsi utama yang akan dijalankan saat command dipanggil.
 * @param {PluginCtx} ctx - Menampung semua instance pesan dan sistem.
 */
async function run(ctx) {
    // 1. Ekstrak parameter yang sering digunakan dari context (ctx)
    const { 
        sock,    // Instance socket Baileys (untuk fungsi advanced)
        m,       // Objek pesan utama dari user
        q,       // Objek pesan yang di-reply (undefined jika tidak ada reply)
        jid,     // ID chat (grup atau private)
        text,    // Teks tambahan setelah command
        prefix,  // Prefix yang dipakai (contoh: .)
        command  // Nama command yang diketik (contoh: example)
    } = ctx

    // 2. Beri reaksi indikator proses berjalan
    await m.react("⏳")

    try {
        // 3. Siapkan teks panduan yang akan dikirimkan bot
        const panduan = `🌟 *PANDUAN STRUKTUR PLUGIN* 🌟

Halo! Fitur *${prefix}${command}* berhasil merespon. 
Ini adalah template dasar base Hailei Catesya.

💡 *Fungsi Helper di ctx:*

*1. m (Message)*
- \`m.arashirep('teks')\` ➯ Mengirim teks balasan.
- \`m.react('🔥')\` ➯ Memberikan reaksi emoji.
- \`m.download('buffer')\` ➯ Mendownload media dari pesan utama.

*2. q (Quoted Message)*
- \`q\` adalah pesan yang sedang di-reply oleh user.
- \`q.text\` ➯ Mengambil teks dari pesan yang di-reply.
- \`q.download('buffer')\` ➯ Mendownload media dari pesan reply.

*3. Parameter Lainnya*
- \`sock\` ➯ Instance Baileys untuk \`sock.sendMessage\`.
- \`jid\` ➯ ID obrolan saat ini.
- \`text\` ➯ Teks argumen dari user (misal: .example *teks ini*).

📝 *Note untuk AI / Developer:*
Gunakan struktur kode di file ini sebagai referensi (prompt) utama untuk membuat logika fitur baru di base ini. Selalu gunakan blok \`try-catch\`!`;

        // 4. Balas pesan user dengan panduan
        await m.arashirep(panduan)
        
        // 5. Ubah reaksi menjadi centang hijau tanda sukses
        await m.react("✅")

    } catch (error) {
        // 6. Tangani error jika terjadi masalah
        console.error(`[Error - ${command}]:`, error)
        await m.react("❌")
        await m.arashirep(`❌ *Gagal memuat template:*\n${error.message}`)
    }
}

/**
 * ==========================================
 * KONFIGURASI METADATA PLUGIN
 * ==========================================
 */
/** @type {PluginType} */
const plugin = {
    run,
    name: "example doc",
    commands: ["example", "contoh"],
    categories: ["tools"],
    description: "Template dasar dan panduan struktur plugin"
}

plugin.meta = {
    filename: "example.js",
    version: "1.0",
    author: "Nama Kamu", // Bebas ubah
    note: "Template murni yang menampilkan panduan penggunaan ctx",
    path: "tools"
}

export default plugin