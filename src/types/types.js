
/**
 * @import {prefixManager} from "../manager/prefix-manager.js"
 * @import {pluginManager} from "../manager/plugin-manager.js"
 * @import {menuManager} from "../manager/menu-manager.js"
 * @import {themeManager} from "../manager/theme-manager.js"
 * @import {contactStore} from "../store/contact-store.js"
 * @import {WAMessage, WAMessageKey, WASocket, proto} from "baileys"
 * @import {Stream} from "node:stream" */

/**
 * @typedef {object} contactSerialize
 * @property {string} lid
 * @property {string|undefined} pn
 * @property {string|undefined} name
 * @property {number} updatedAt
 */

/**
 * @typedef {object} contactCache
 * @property {number} id
 * @property {string} lid
 * @property {string|undefined} pn
 * @property {string|undefined} name
 */

/**
 * @typedef {object}chatSerialize
 * @property {string} jid ini biasanya kita masukin remoteJid dari WAMessageKey
 * @property {string | undefined} name ini opsional, biasanya kalau grup baru isi nama
 * @property {number | undefined} timestamp opsional, timestamp pesan terakhir (detik unix), buat update last_message_at
 */
/**
 * @typedef {object} chatCache
 * @property {number} id id dari database
 * @property {string} jid biasanya kita masukin remote jid
 * @property {string | undefined} name chat name
 * @property {number | undefined} last_message_at timestamp pesan terakhir di chat ini (detik unix)
 */

/**
 * @typedef {object} groupKeyMessage
 * @property {string|undefined} admin
 * @property {string|undefined} label
 */

/**
 * ini outputnya, yg konsisten cuma variabel kind, id dan displayText, untuk description dan index itu kadang ada kadang undefined
 * @typedef {object} buttonSerialize button serialized
 * @property {string} kind jenis button nya, biasanya. liat aja kode di bawah
 * @property {string} id ini biasanya yang kalian gunakan untuk deteksi command
 * @property {string} displayText teks yang muncul di chat wacap
 * @property {string | undefined} description deskripsi button
 * @property {number | undefined} index index, biasanya muncul pas tipe button quick_reply
 */

/**
 * @typedef {WAMessage & {
 * chat: chatCache | undefined,
 * contact: contactCache | undefined,
 * group: groupKeyMessage | undefined,
 * content: keyof proto.IMessage,
 * text: string | undefined,
 * sender: string | undefined,
 * download: Promise <Buffer | Stream.Transform>,
 * react: Promise <WAMessage| undefined>,
 * reply: Promise <WAMessage | undefined>,
 * button?: buttonSerialize | undefined,
 * q?: messageSerialize | undefined,
 * fullMessage?: WAMessage | undefined
 * }} messageSerialize
 */

/**
 * @typedef {object} PluginConfig
 * @property {boolean} [bypassPrefix] kalau true maka plugin gk perlu prefix (walaupun prefix on) biasanya plugin eval dan shell
 * @property {boolean} [bypassLock] kalau true maka plugin tetep bisa jalan walaupun bot lagi di-lock (global.isBotLocked). dipakai command lock/unlock sendiri.
 * @property {boolean} [protected] kalau true maka plugin gak bisa di hapus, biasanya plugin core punya ini
 * @property {boolean} [removeFirstUrl] set true kalau hentak ingin sisipkan url di deskripsi atau di author note, dan isikan key url pada meta plugin
 */

/**
 * @typedef {object} PluginCtx
 * @property {WASocket} sock,
 * @property {WAMessageKey['remoteJid']} jid,
 * @property {messageSerialize} m,
 * @property {messageSerialize | undefined} q,
 * @property {string | undefined} text,
 * @property {string | undefined} prefix,
 * @property {string | undefined} command
 * @property {boolean} isOwner true kalau pengirim base/trusted owner. cek ini di awal plugin owner-only lalu return kalau false.
 * @property {boolean} isAdmin true kalau pengirim admin/superadmin di grup ini (dari src/helper/group-admin.js). selalu false di private chat.
 * @property {boolean} isBot true kalau BOT sendiri berstatus admin di grup ini. selalu false di private chat, dan false kalau bot belum diangkat admin.
 * @property {boolean} Kadokun true kalau pengirim base dev (config.devNumb). lebih sempit dari isOwner (isOwner juga true buat trusted user, Kadokun cuma true buat dev asli).
 * @property {typeof pluginEnableManager} pluginEnableManager buat cek/atur command yang di-disable (data/plugin-enabled.json)
 * @property {typeof pluginManager} pluginManager
 * @property {typeof menuManager} menuManager
 * @property {typeof themeManager} themeManager
 * @property {typeof prefixManager} prefixManager
 * @property {typeof contactStore} contactStore
 * @property {import("../store/make-in-memory-store.js").messageStore} messageStore cache pesan in-memory, dipake buat q.fullMessage & loadMessage(jid, id) manual
 */

/**
 * @typedef {object} pluginMeta
 * @property {string} filename filename dari plugin. misal ping.js
 * @property {string|undefined} author nama pembuat plugin / yang rawat plugin nya
 * @property {string|undefined} note catatan gabut author plugin
 * @property {string} version catatan version plugin, bebas aja
 * @property {string} [url] url buat help, kadang isi kadang engga
 * @property {string} [path] nama subfolder kategori tujuan saat plugin di install, contoh "owner" -> plugins/owner/<filename>. kalau gak di isi, plugin di taro di root folder plugins/
 */

/**
 * @typedef {object} Plugin
 * @property {Promise<any>} run fungsi utama, menerima param pluginCtx
 * @property {string} name nama plugin
 * @property {[string]} commands array command
 * @property {[string]} categories array kategory
 * @property {string | undefined} description deskripsi plugin
 * @property {pluginMeta} meta plugin metadata untuk install / share plugin
 * @property {PluginConfig} [config] additional plugin config
 * @property {string} path path absolute lokasi plugin
 */

/**
 * @typedef {object} PluginType
 * @property {Promise<any>} run fungsi utama, menerima param pluginCtx
 * @property {string} name nama plugin
 * @property {[string]} commands array command
 * @property {[string]} categories array kategory
 * @property {string | undefined} description deskripsi plugin
 * @property {pluginMeta} meta plugin metadata untuk install / share plugin
 * @property {PluginConfig} [config] additional plugin config
 * @property {string} path path absolute lokasi plugin
 */

/**
 * @typedef {object} CommonResponse
 * @property {boolean} ok
 * @property {string|undefined} message
 */


/**
 * @typedef {"install" | "fail" | "replace"} PluginVerifikatorStatus
 */

/**
 * @typedef {object} PluginVerifikatorResponse
 * @property {PluginVerifikatorStatus} status
 * @property {string|undefined} message
 */

/**
 * @typedef {object} PrefixResult
 * @property {boolean} ok true kalau match prefix, false kalau gak match prefix, kalau prefix off maka akan selalu true
 * @property {string|undefined} prefix berisikan string prefix yang benar dari salah satu list, hasil menyesuaikan, bisa undefined
 * @property {string|undefined} data adalah teks yang sudah di hapus prefix nya, [].halo] menjadi [halo], [. halo] menjadi [ halo]
 */

/**
 * @typedef {Object} PrefixStatus
 * @property {boolean} isPrefixActive
 * @property {string[]} prefixList
 */

export { }