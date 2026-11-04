// node import
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

// my import
import { allPaths } from '#root/src/all-paths.js'

// auto mkdir folder data biar ga eror kalau folder data belum ada (baru clone / abis backup tanpa data/)
// dieksekusi sinkron di sini karena database.js ini bisa aja ke-load duluan sebelum bootstrap-data.js
// jalan (import di module lain dieksekusi duluan sebelum statement lokal di bot.js)
fs.mkdirSync(path.dirname(allPaths.database), { recursive: true })

const db = new DatabaseSync(allPaths.database)

db.exec(`
    PRAGMA journal_mode = WAL;
    `)

db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY,
        lid TEXT NOT NULL UNIQUE,
        pn TEXT UNIQUE,
        push_name TEXT,
        updated_at INTEGER
    ) STRICT`
)

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY,
    jid TEXT UNIQUE NOT NULL,
    name TEXT
  )
`)

db.exec(`
CREATE TABLE IF NOT EXISTS group_participants (
    chat_id INTEGER NOT NULL REFERENCES chats(id),
    contact_id INTEGER NOT NULL REFERENCES contacts(id),
    invited_by INTEGER REFERENCES contacts(id),
    invited_at INTEGER,
    kicked_by INTEGER REFERENCES contacts (id),
    kicked_at INTEGER,
    admin TEXT,
    admin_updated_by INTEGER REFERENCES contacts(id),
    admin_updated_at INTEGER,
    label TEXT,
    label_updated_at INTEGER,	

    PRIMARY KEY (chat_id, contact_id)
) WITHOUT ROWID;
`)
db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY,
    jid TEXT UNIQUE NOT NULL,
    name TEXT,
    last_message_at INTEGER
  )
`)

// jaga-jaga buat database lama yang tabel chats nya belum punya kolom last_message_at
try {
  db.exec(`ALTER TABLE chats ADD COLUMN last_message_at INTEGER`)
} catch (e) {
  // udah ada kolomnya, aman, skip aja
}

db.exec(`
CREATE TABLE IF NOT EXISTS plugin_permission (
	contact_id INTEGER REFERENCES contacts (id),
	command TEXT,
	grant_by INTEGER REFERENCES contacts (id),
	timestamp INTEGER,
	
	PRIMARY KEY (contact_id, command)
) WITHOUT ROWID;
`)

// tabel buat nyimpen owner yang di trust manual (selain owner bawaan di config.js)
// biar kalau bot restart / ganti sesi, statusnya tetep ke save selama masih ada di tabel ini
db.exec(`
CREATE TABLE IF NOT EXISTS owners (
	pn TEXT PRIMARY KEY,
	added_by TEXT,
	timestamp INTEGER
) STRICT;
`)


export { db }