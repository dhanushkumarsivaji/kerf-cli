import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrations.js";

function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
}

describe("migration v4 — tool column", () => {
  it("adds tool columns and backfills existing rows to 'claude-code'", () => {
    const db = new Database(":memory:");

    // Apply only migrations through v3 by faking v4 as already-not-applied is
    // tricky; instead run all migrations on a fresh DB, then verify defaults
    // backfill by inserting a row WITHOUT specifying tool.
    runMigrations(db);

    expect(columns(db, "messages")).toContain("tool");
    expect(columns(db, "sessions_meta")).toContain("tool");
    expect(columns(db, "daily_summaries")).toContain("tool_breakdown");

    // A row inserted without a tool value defaults to 'claude-code' (the
    // backfill mechanism for pre-existing users' data).
    db.prepare(
      `INSERT INTO messages
        (message_id, session_id, project_path, model, timestamp, source_file)
       VALUES ('m1', 's1', '/p', 'claude-sonnet-4', '2026-05-01T00:00:00Z', '/p/s.jsonl')`,
    ).run();

    const row = db.prepare(`SELECT tool FROM messages WHERE message_id = 'm1'`).get() as {
      tool: string;
    };
    expect(row.tool).toBe("claude-code");

    db.close();
  });

  it("backfills tool on rows that pre-date v4", () => {
    const db = new Database(":memory:");

    // Simulate an older DB: create schema_migrations and apply v1–v3 only.
    db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT);
    `);
    // Minimal pre-v4 messages table (no tool column).
    db.exec(`
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        project_path TEXT NOT NULL,
        model TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        source_file TEXT NOT NULL,
        UNIQUE(message_id, session_id)
      );
      CREATE TABLE sessions_meta (
        session_id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        first_message_at TEXT NOT NULL,
        last_message_at TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        total_input_tokens INTEGER NOT NULL DEFAULT 0,
        total_output_tokens INTEGER NOT NULL DEFAULT 0,
        total_cache_read INTEGER NOT NULL DEFAULT 0,
        total_cache_creation INTEGER NOT NULL DEFAULT 0,
        total_cost_usd REAL NOT NULL DEFAULT 0,
        models TEXT NOT NULL DEFAULT '[]',
        last_synced_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE daily_summaries (
        date TEXT PRIMARY KEY,
        total_cost_usd REAL NOT NULL DEFAULT 0,
        total_input_tokens INTEGER NOT NULL DEFAULT 0,
        total_output_tokens INTEGER NOT NULL DEFAULT 0,
        total_cache_read INTEGER NOT NULL DEFAULT 0,
        total_cache_creation INTEGER NOT NULL DEFAULT 0,
        message_count INTEGER NOT NULL DEFAULT 0,
        session_count INTEGER NOT NULL DEFAULT 0,
        model_breakdown TEXT NOT NULL DEFAULT '{}',
        project_breakdown TEXT NOT NULL DEFAULT '{}',
        computed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.prepare(`INSERT INTO schema_migrations (version) VALUES (1), (2), (3)`).run();

    // Old data with no tool column.
    db.prepare(
      `INSERT INTO messages
        (message_id, session_id, project_path, model, timestamp, source_file)
       VALUES ('old1', 's0', '/p', 'claude-opus-4', '2026-04-01T00:00:00Z', '/p/s0.jsonl')`,
    ).run();

    // Now run migrations — only v4 should apply.
    runMigrations(db);

    const row = db.prepare(`SELECT tool FROM messages WHERE message_id = 'old1'`).get() as {
      tool: string;
    };
    expect(row.tool).toBe("claude-code");

    db.close();
  });
});
