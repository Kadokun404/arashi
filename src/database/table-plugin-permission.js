import { db } from "./database.js";

const pluginPermissionStmt = {}

pluginPermissionStmt.insert = db.prepare(`
    INSERT INTO plugin_permission 
    (contact_id, command, grant_by, timestamp)
    VALUES (
        :contactId,
        :command,
        :givenBy,
        :timestamp
    )
`)

pluginPermissionStmt.getAll = db.prepare(`
    SELECT lid, command
    FROM plugin_permission pp

    LEFT JOIN contacts c
    ON pp.contact_id = c.id    
`)

export { pluginPermissionStmt }