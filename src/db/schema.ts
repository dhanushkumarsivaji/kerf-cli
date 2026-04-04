import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { KERF_DB_PATH } from "../core/config.js";

export function initDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? KERF_DB_PATH;
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  createTables(db);
  return db;
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      amount_usd REAL NOT NULL,
      period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, period)
    );

    CREATE TABLE IF NOT EXISTS usage_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL,
      UNIQUE(project_id, session_id, timestamp)
    );

    CREATE INDEX IF NOT EXISTS idx_usage_project_time
      ON usage_snapshots(project_id, timestamp);
  `);
}
