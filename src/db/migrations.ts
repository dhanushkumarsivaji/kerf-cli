import type Database from "better-sqlite3";

interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    description: "Initial schema",
    up(_db) {
      // Schema is created in schema.ts on init — this is a placeholder for future migrations
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
      .map((row: any) => row.version as number),
  );

  for (const migration of migrations) {
    if (!applied.has(migration.version)) {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
    }
  }
}
