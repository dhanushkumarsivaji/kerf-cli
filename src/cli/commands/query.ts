import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "node:fs";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|PRAGMA|REPLACE|TRUNCATE)\b/i;

const SCHEMA_TEXT = `
messages (
  id                    INTEGER PRIMARY KEY,
  message_id            TEXT UNIQUE,
  session_id            TEXT,
  project_path          TEXT,
  model                 TEXT,
  timestamp             TEXT,
  input_tokens          INTEGER,
  output_tokens         INTEGER,
  cache_read_tokens     INTEGER,
  cache_creation_tokens INTEGER,
  cost_usd              REAL,
  source_file           TEXT
)

sessions_meta (
  session_id            TEXT PRIMARY KEY,
  project_path          TEXT,
  first_message_at      TEXT,
  last_message_at       TEXT,
  message_count         INTEGER,
  total_input_tokens    INTEGER,
  total_output_tokens   INTEGER,
  total_cache_read      INTEGER,
  total_cache_creation  INTEGER,
  total_cost_usd        REAL,
  models                TEXT (JSON array),
  last_synced_at        TEXT
)

ingest_state (
  source_file           TEXT PRIMARY KEY,
  last_size             INTEGER,
  last_modified         TEXT
)

daily_summaries (
  date                  TEXT PRIMARY KEY,
  total_cost_usd        REAL,
  total_input_tokens    INTEGER,
  total_output_tokens   INTEGER,
  total_cache_read      INTEGER,
  total_cache_creation  INTEGER,
  message_count         INTEGER,
  session_count         INTEGER,
  model_breakdown       TEXT (JSON),
  project_breakdown     TEXT (JSON)
)
`.trim();

const EXAMPLES: Array<{ title: string; sql: string }> = [
  {
    title: "Top 10 most expensive projects (all time)",
    sql: `SELECT project_path, ROUND(SUM(cost_usd), 2) AS cost, COUNT(DISTINCT session_id) AS sessions
FROM messages
GROUP BY project_path
ORDER BY cost DESC
LIMIT 10;`,
  },
  {
    title: "Last 7 days by model",
    sql: `SELECT model, ROUND(SUM(cost_usd), 2) AS cost, COUNT(*) AS msgs
FROM messages
WHERE timestamp >= date('now', '-7 days')
GROUP BY model
ORDER BY cost DESC;`,
  },
  {
    title: "Last 30 days by date",
    sql: `SELECT date(timestamp) AS day, ROUND(SUM(cost_usd), 2) AS cost, COUNT(*) AS msgs
FROM messages
WHERE timestamp >= date('now', '-30 days')
GROUP BY day
ORDER BY day DESC;`,
  },
  {
    title: "Sessions over $5",
    sql: `SELECT session_id, project_path, ROUND(total_cost_usd, 2) AS cost, message_count
FROM sessions_meta
WHERE total_cost_usd > 5
ORDER BY total_cost_usd DESC;`,
  },
  {
    title: "Cache hit rate by model",
    sql: `SELECT model,
  SUM(cache_read_tokens) AS cache_read,
  SUM(cache_creation_tokens) AS cache_write,
  SUM(input_tokens) AS raw_input,
  ROUND(
    100.0 * SUM(cache_read_tokens) /
    NULLIF(SUM(cache_read_tokens) + SUM(input_tokens), 0),
    2
  ) AS cache_hit_pct
FROM messages
GROUP BY model
ORDER BY cache_hit_pct DESC;`,
  },
];

function pad(str: string, width: number): string {
  if (str.length >= width) return str;
  return str + " ".repeat(width - str.length);
}

function renderTable(columns: string[], rows: unknown[][]): string {
  const stringRows = rows.map((r) => r.map((c) => formatCell(c)));
  const widths = columns.map((h, i) =>
    Math.max(h.length, ...stringRows.map((r) => (r[i] ?? "").length)),
  );
  const sep = "  ";
  const headerLine = columns.map((h, i) => pad(h, widths[i]!)).join(sep);
  const dividerLine = widths.map((w) => "-".repeat(w)).join(sep);
  const dataLines = stringRows.map((r) =>
    r.map((c, i) => pad(c ?? "", widths[i]!)).join(sep),
  );
  return [chalk.bold(headerLine), dividerLine, ...dataLines].join("\n");
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function toCsv(columns: string[], rows: unknown[][]): string {
  const escape = (s: string) =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return [
    columns.map(escape).join(","),
    ...rows.map((r) => r.map((c) => escape(formatCell(c))).join(",")),
  ].join("\n");
}

export function registerQueryCommand(program: Command): void {
  program
    .command("query [sql]")
    .description("Run a read-only SQL query against kerf's analytics database")
    .option("--file <path>", "Read SQL from a file")
    .option("--json", "Output as JSON")
    .option("--csv", "Output as CSV")
    .option("--schema", "Print the analytics schema")
    .option("--examples", "Print example queries")
    .action((sqlArg: string | undefined, opts) => {
      if (opts.schema) {
        console.log(chalk.bold.cyan("\n  kerf analytics schema\n"));
        console.log(SCHEMA_TEXT);
        console.log();
        return;
      }

      if (opts.examples) {
        console.log(chalk.bold.cyan("\n  kerf query — example queries\n"));
        for (const ex of EXAMPLES) {
          console.log(chalk.bold(`  ${ex.title}`));
          console.log(
            ex.sql
              .split("\n")
              .map((l) => "    " + chalk.dim(l))
              .join("\n"),
          );
          console.log();
        }
        return;
      }

      let sql: string | undefined = sqlArg;
      if (opts.file) {
        try {
          sql = readFileSync(opts.file, "utf-8");
        } catch (err) {
          console.error(chalk.red(`Failed to read SQL file: ${opts.file}`));
          console.error(err);
          process.exit(1);
        }
      }

      if (!sql || sql.trim() === "") {
        console.error(
          chalk.red(
            'Usage: kerf query "<sql>" or kerf query --file <path>. Try --examples or --schema.',
          ),
        );
        process.exit(1);
      }

      const forbidden = sql.match(FORBIDDEN);
      if (forbidden) {
        console.error(
          chalk.red(
            `kerf query is read-only. Rejected statement: ${forbidden[1]!.toUpperCase()}`,
          ),
        );
        process.exit(1);
      }

      const db = initDatabase();
      runMigrations(db);

      try {
        const stmt = db.prepare(sql);
        let rows: Record<string, unknown>[];
        try {
          rows = stmt.all() as Record<string, unknown>[];
        } catch (err) {
          // Some statements (e.g. EXPLAIN) may not return rows through all()
          console.error(chalk.red("Query failed:"));
          console.error(err);
          process.exit(1);
        }

        const columns =
          rows.length > 0
            ? Object.keys(rows[0]!)
            : (stmt.columns?.().map((c) => c.name) ?? []);

        if (opts.json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }

        if (opts.csv) {
          const dataRows = rows.map((r) => columns.map((c) => r[c]));
          console.log(toCsv(columns, dataRows));
          return;
        }

        if (rows.length === 0) {
          console.log(chalk.dim("(no rows)"));
          return;
        }

        const dataRows = rows.map((r) => columns.map((c) => r[c]));
        console.log(renderTable(columns, dataRows));
        console.log(chalk.dim(`\n${rows.length} row${rows.length === 1 ? "" : "s"}`));
      } finally {
        db.close();
      }
    });
}
