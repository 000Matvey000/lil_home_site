import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
var dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
export var db = new Database(path.join(dataDir, "lil_home_site.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec("\n  CREATE TABLE IF NOT EXISTS users (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    username TEXT NOT NULL UNIQUE,\n    password_hash TEXT NOT NULL,\n    role TEXT NOT NULL CHECK(role IN ('user', 'admin')),\n    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n  );\n  CREATE TABLE IF NOT EXISTS links (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    title TEXT NOT NULL,\n    url TEXT,\n    description TEXT NOT NULL DEFAULT '',\n    department TEXT NOT NULL DEFAULT 'General',\n    color TEXT NOT NULL DEFAULT '#4f46e5',\n    thumbnail_name TEXT,\n    thumbnail_type TEXT,\n    thumbnail_data BLOB,\n    attachment_name TEXT,\n    attachment_type TEXT,\n    attachment_data BLOB,\n    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n  );\n  CREATE TABLE IF NOT EXISTS announcements (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    title TEXT NOT NULL,\n    body TEXT NOT NULL DEFAULT '',\n    color TEXT NOT NULL DEFAULT '#4f46e5',\n    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n  );\n  CREATE TABLE IF NOT EXISTS settings (\n    key TEXT PRIMARY KEY,\n    value TEXT NOT NULL\n  );\n");
