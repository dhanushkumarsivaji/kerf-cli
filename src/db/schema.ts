import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { KERF_DB_PATH } from "../core/config.js";

/**
 * Open (and create if needed) the kerf SQLite database.
 * Does NOT create tables — that is the responsibility of runMigrations.
 */
export function initDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? KERF_DB_PATH;
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
