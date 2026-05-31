import type Database from "better-sqlite3";

interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    description: "Initial schema (projects, budgets, usage_snapshots)",
    up(db) {
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
    },
  },
  {
    version: 2,
    description: "Analytics schema (messages, sessions_meta, ingest_state)",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
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
          git_branch TEXT,
          source_file TEXT NOT NULL,
          ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(message_id, session_id)
        );

        CREATE TABLE IF NOT EXISTS sessions_meta (
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
          git_branches TEXT NOT NULL DEFAULT '[]',
          last_synced_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ingest_state (
          source_file TEXT PRIMARY KEY,
          last_size INTEGER NOT NULL DEFAULT 0,
          last_modified TEXT NOT NULL,
          last_ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
          message_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_path);
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
        CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model);
        CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions_meta(project_path);
        CREATE INDEX IF NOT EXISTS idx_sessions_last_msg ON sessions_meta(last_message_at);
      `);
    },
  },
  {
    version: 3,
    description: "Daily summaries for long-term history beyond Claude Code's 30-day retention",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS daily_summaries (
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

        CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_summaries(date);
      `);
    },
  },
  {
    version: 4,
    description: "Multi-tool support: add tool column to messages, sessions_meta, daily_summaries",
    up(db) {
      db.exec(`
        ALTER TABLE messages ADD COLUMN tool TEXT NOT NULL DEFAULT 'claude-code';
        ALTER TABLE sessions_meta ADD COLUMN tool TEXT NOT NULL DEFAULT 'claude-code';
        ALTER TABLE daily_summaries ADD COLUMN tool_breakdown TEXT NOT NULL DEFAULT '{}';
        CREATE INDEX IF NOT EXISTS idx_messages_tool ON messages(tool);
        CREATE INDEX IF NOT EXISTS idx_sessions_tool ON sessions_meta(tool);
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => (row as { version: number }).version),
  );

  for (const migration of migrations) {
    if (!applied.has(migration.version)) {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
    }
  }
}
