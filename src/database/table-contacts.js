import { db } from "./database.js";
const contactStmt = {}

contactStmt.insertNewContact = db.prepare(`
    INSERT INTO contacts (\`lid\`, \`pn\`, \`push_name\`, \`updated_at\`)
    VALUES (
    :lid,
    :pn,
    coalesce(:name, null),
    coalesce(:updatedAt, unixepoch('now')))
    
    RETURNING
    id,
    lid,
    pn, 
    push_name as name
    `)


contactStmt.selectAll = db.prepare(`
    SELECT
    id,
    lid,
    pn,
    push_name as name
    from contacts
    `)

contactStmt.updateContact = db.prepare(`
    UPDATE contacts
    SET 
    pn = coalesce (:pn, pn),
    push_name = coalesce (:name, push_name),
    updated_at = coalesce (:updatedAt, unixepoch('now'))
    WHERE id = :id
    
    RETURNING
    id,
    lid,
    pn, 
    push_name as name
`)

contactStmt.getById = db.prepare(`
    SELECT 
    id, lid, pn,
    push_name as name
    FROM contacts
    where id = :id
`)

// beda sama updateContact: yang ini SENGAJA gak pakai coalesce, biar pn
// beneran ke-set NULL (bukan "gak ada perubahan"). dipakai pas pn mau
// dipindah ke lid lain, row lama harus di-lepas pn nya dulu biar gak
// nabrak UNIQUE constraint di kolom pn
contactStmt.clearPn = db.prepare(`
    UPDATE contacts
    SET pn = NULL
    WHERE id = :id

    RETURNING
    id,
    lid,
    pn,
    push_name as name
`)

export { contactStmt }