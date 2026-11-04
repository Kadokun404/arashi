import { db } from "./database.js";



const chatStmt = {}

chatStmt.selectAll = db.prepare(`
  SELECT * FROM chats  
`)

chatStmt.insert = db.prepare(`
    INSERT INTO chats (jid, name, last_message_at)
    VALUES (:jid, :name, :lastMessageAt)
    RETURNING *
`)

chatStmt.updateNameById = db.prepare(`
    UPDATE chats
    SET name = coalesce (:name, name)
    WHERE id = :id
    RETURNING *
`)

chatStmt.touchTimestampById = db.prepare(`
    UPDATE chats
    SET last_message_at = :lastMessageAt
    WHERE id = :id
    AND (last_message_at IS NULL OR last_message_at < :lastMessageAt)
    RETURNING *
`)

export { chatStmt }