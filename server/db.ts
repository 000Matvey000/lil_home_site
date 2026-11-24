import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db: any = new Database(path.join(dataDir, "lil_home_site.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT,
    description TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT 'General',
    color TEXT NOT NULL DEFAULT '#4f46e5',
    category TEXT NOT NULL DEFAULT '',
    thumbnail_name TEXT,
    thumbnail_type TEXT,
    thumbnail_data BLOB,
    attachment_name TEXT,
    attachment_type TEXT,
    attachment_data BLOB,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#4f46e5',
    category TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS site_assets (
    key TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_data BLOB NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🧩',
    endpoint_url TEXT NOT NULL,
    auth_header TEXT NOT NULL DEFAULT 'Authorization',
    auth_token TEXT NOT NULL DEFAULT '',
    auth_scheme TEXT NOT NULL DEFAULT 'Bearer',
    is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
    response_path TEXT NOT NULL DEFAULT '',
    mappings_json TEXT NOT NULL DEFAULT '[]',
    refresh_minutes INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function hasColumn(table: string, column: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((item) => item.name === column);
}

if (!hasColumn("links", "category")) {
  db.exec("ALTER TABLE links ADD COLUMN category TEXT NOT NULL DEFAULT ''");
}

if (!hasColumn("announcements", "category")) {
  db.exec("ALTER TABLE announcements ADD COLUMN category TEXT NOT NULL DEFAULT ''");
}

if (!hasColumn("integrations", "is_public")) {
  db.exec("ALTER TABLE integrations ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1))");
}
