import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

const db = await open({
    filename: 'database.db',
    driver: sqlite3.Database
});

await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        thresh NUMERIC NOT NULL,
        price NUMERIC,
        alerted BOOLEAN DEFAULT FALSE
    )
`);

await db.exec(`
    CREATE TABLE IF NOT EXISTS history (
        timestamp DATETIME PRIMARY KEY,
        price NUMERIC NOT NULL
    )
`);

export { db };