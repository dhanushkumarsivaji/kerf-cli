import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrations.js";

function freshDb(): Database.Database {
  return new Database(":memory:");
}

function tableNames(db: Database.Database): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);
}

describe("runMigrations", () => {
  it("creates all v1 tables (projects, budgets, usage_snapshots)", () => {
    const db = freshDb();
    runMigrations(db);
    const tables = tableNames(db);
    expect(tables).toContain("projects");
    expect(tables).toContain("budgets");
    expect(tables).toContain("usage_snapshots");
    expect(tables).toContain("schema_migrations");
    db.close();
  });

  it("creates v2 analytics tables (messages, sessions_meta, ingest_state)", () => {
    const db = freshDb();
    runMigrations(db);
    const tables = tableNames(db);
    expect(tables).toContain("messages");
    expect(tables).toContain("sessions_meta");
    expect(tables).toContain("ingest_state");
    db.close();
  });

  it("creates v3 daily_summaries table", () => {
    const db = freshDb();
    runMigrations(db);
    expect(tableNames(db)).toContain("daily_summaries");
    db.close();
  });

  it("is idempotent — calling twice does not error or duplicate rows", () => {
    const db = freshDb();
    runMigrations(db);
    const firstCount = (db.prepare("SELECT COUNT(*) as c FROM schema_migrations").get() as { c: number }).c;
    runMigrations(db);
    const secondCount = (db.prepare("SELECT COUNT(*) as c FROM schema_migrations").get() as { c: number }).c;
    expect(firstCount).toBe(secondCount);
    db.close();
  });

  it("records each applied migration version", () => {
    const db = freshDb();
    runMigrations(db);
    const versions = db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((r) => (r as { version: number }).version);
    expect(versions).toEqual([1, 2, 3]);
    db.close();
  });

  it("creates expected indexes", () => {
    const db = freshDb();
    runMigrations(db);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(indexes).toContain("idx_messages_session");
    expect(indexes).toContain("idx_messages_project");
    expect(indexes).toContain("idx_sessions_project");
    expect(indexes).toContain("idx_daily_date");
    db.close();
  });
});
