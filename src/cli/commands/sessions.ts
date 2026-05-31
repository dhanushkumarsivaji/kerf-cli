import { Command } from "commander";
import chalk from "chalk";
import { basename } from "node:path";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import { formatCost, formatTokens } from "../../core/costCalculator.js";

interface SessionMetaRow {
  session_id: string;
  project_path: string;
  first_message_at: string;
  last_message_at: string;
  message_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read: number;
  total_cache_creation: number;
  total_cost_usd: number;
  models: string;
  tool: string;
  last_synced_at: string;
}

const TOOL_LABELS: Record<string, string> = {
  "claude-code": "claude",
  codex: "codex",
  gemini: "gemini",
  external: "external",
};

function shortTool(t: string): string {
  return TOOL_LABELS[t] ?? t;
}

interface MessageRow {
  message_id: string;
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd: number;
}

function pad(str: string, width: number, align: "left" | "right" = "left"): string {
  if (str.length >= width) return str;
  const padding = " ".repeat(width - str.length);
  return align === "left" ? str + padding : padding + str;
}

function renderTable(
  headers: string[],
  rows: string[][],
  aligns: ("left" | "right")[],
): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const sep = "  ";
  const headerLine = headers.map((h, i) => pad(h, widths[i]!, aligns[i] ?? "left")).join(sep);
  const dividerLine = widths.map((w) => "-".repeat(w)).join(sep);
  const dataLines = rows.map((r) =>
    r.map((c, i) => pad(c ?? "", widths[i]!, aligns[i] ?? "left")).join(sep),
  );
  return [chalk.bold(headerLine), dividerLine, ...dataLines].join("\n");
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function formatDuration(firstIso: string, lastIso: string): string {
  const ms = new Date(lastIso).getTime() - new Date(firstIso).getTime();
  if (isNaN(ms) || ms < 0) return "-";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h${remMin > 0 ? `${remMin}m` : ""}`;
}

function parseModels(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr.filter((m) => m != null && m !== "");
  } catch {
    // ignore
  }
  return [];
}

function shortModel(m: string): string {
  // claude-3-5-sonnet-20241022 -> sonnet-3.5
  // claude-opus-4-20250514 -> opus-4
  return m.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

export function registerSessionsCommand(program: Command): void {
  program
    .command("sessions [session_id]")
    .description("List or inspect Claude Code sessions from kerf's analytics database")
    .option("--limit <n>", "Maximum number of sessions to show", "20")
    .option("--project <path>", "Filter by project path")
    .option("--tool <tool>", "Filter by tool (claude-code, codex, …)")
    .option("--since <iso_date>", "Only sessions with last_message_at >= ISO date")
    .option(
      "--sort <key>",
      "Sort by: cost|messages|duration|recent",
      "recent",
    )
    .option("--json", "Output as JSON")
    .action((sessionId: string | undefined, opts) => {
      const db = initDatabase();
      runMigrations(db);

      try {
        if (sessionId) {
          showSessionDetail(db, sessionId, opts);
        } else {
          showSessionList(db, opts);
        }
      } finally {
        db.close();
      }
    });
}

function showSessionList(db: import("better-sqlite3").Database, opts: { limit: string; project?: string; tool?: string; since?: string; sort: string; json?: boolean }): void {
  const limit = parseInt(opts.limit, 10);
  if (isNaN(limit) || limit <= 0) {
    console.error(chalk.red("--limit must be a positive integer"));
    process.exit(1);
  }

  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.project) {
    where.push("project_path = ?");
    params.push(opts.project);
  }
  if (opts.tool) {
    where.push("tool = ?");
    params.push(opts.tool);
  }
  if (opts.since) {
    where.push("last_message_at >= ?");
    params.push(opts.since);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const sortMap: Record<string, string> = {
    cost: "total_cost_usd DESC",
    messages: "message_count DESC",
    duration: "(julianday(last_message_at) - julianday(first_message_at)) DESC",
    recent: "last_message_at DESC",
  };
  const orderBy = sortMap[opts.sort] ?? sortMap.recent;

  const rows = db
    .prepare(
      `SELECT * FROM sessions_meta ${whereSql} ORDER BY ${orderBy} LIMIT ?`,
    )
    .all(...params, limit) as SessionMetaRow[];

  if (opts.json) {
    console.log(
      JSON.stringify(
        rows.map((r) => ({
          ...r,
          models: parseModels(r.models),
        })),
        null,
        2,
      ),
    );
    return;
  }

  if (rows.length === 0) {
    console.log(
      chalk.yellow("No sessions found. Run kerf sync first."),
    );
    return;
  }

  console.log(chalk.bold.cyan("\n  kerf sessions\n"));
  const headers = ["When", "Tool", "Project", "Models", "Msgs", "Cost", "Duration", "Session"];
  const tableRows = rows.map((r) => [
    relativeTime(r.last_message_at),
    shortTool(r.tool ?? "claude-code"),
    basename(r.project_path || ""),
    parseModels(r.models).map(shortModel).join(",") || "-",
    String(r.message_count),
    formatCost(r.total_cost_usd ?? 0),
    formatDuration(r.first_message_at, r.last_message_at),
    r.session_id.slice(0, 8),
  ]);
  console.log(
    renderTable(headers, tableRows, ["left", "left", "left", "left", "right", "right", "right", "left"])
      .split("\n")
      .map((l) => "  " + l)
      .join("\n"),
  );
  console.log();
}

function showSessionDetail(db: import("better-sqlite3").Database, sessionId: string, opts: { json?: boolean }): void {
  const meta = db
    .prepare(`SELECT * FROM sessions_meta WHERE session_id = ?`)
    .get(sessionId) as SessionMetaRow | undefined;

  if (!meta) {
    console.error(chalk.red(`Session not found: ${sessionId}`));
    console.error("Run kerf sync first, or check the session id.");
    process.exit(1);
  }

  const messages = db
    .prepare(
      `SELECT message_id, timestamp, model, input_tokens, output_tokens,
              cache_read_tokens, cache_creation_tokens, cost_usd
       FROM messages WHERE session_id = ? ORDER BY timestamp ASC`,
    )
    .all(sessionId) as MessageRow[];

  const modelBreakdown = db
    .prepare(
      `SELECT model, SUM(cost_usd) as cost, COUNT(*) as msgs,
              SUM(input_tokens) as input, SUM(output_tokens) as output
       FROM messages WHERE session_id = ? GROUP BY model ORDER BY cost DESC`,
    )
    .all(sessionId) as Array<{
      model: string;
      cost: number;
      msgs: number;
      input: number;
      output: number;
    }>;

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          session: { ...meta, models: parseModels(meta.models) },
          messages,
          modelBreakdown,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(chalk.bold.cyan(`\n  kerf session ${meta.session_id}\n`));
  console.log(`  Project:   ${meta.project_path}`);
  console.log(`  Cost:      ${chalk.green(formatCost(meta.total_cost_usd ?? 0))}`);
  console.log(`  Messages:  ${meta.message_count}`);
  console.log(`  First:     ${meta.first_message_at}`);
  console.log(`  Last:      ${meta.last_message_at}`);
  console.log(`  Duration:  ${formatDuration(meta.first_message_at, meta.last_message_at)}`);

  if (messages.length > 0) {
    console.log(chalk.bold("\n  Timeline:\n"));
    const headers = ["Time", "Model", "In", "Out", "Cost"];
    const tableRows = messages.map((m) => [
      m.timestamp.replace("T", " ").slice(0, 19),
      shortModel(m.model || "-"),
      formatTokens(m.input_tokens ?? 0),
      formatTokens(m.output_tokens ?? 0),
      formatCost(m.cost_usd ?? 0),
    ]);
    console.log(
      renderTable(headers, tableRows, ["left", "left", "right", "right", "right"])
        .split("\n")
        .map((l) => "  " + l)
        .join("\n"),
    );
  }

  if (modelBreakdown.length > 0) {
    console.log(chalk.bold("\n  By model:\n"));
    const headers = ["Model", "Msgs", "Input", "Output", "Cost"];
    const tableRows = modelBreakdown.map((m) => [
      shortModel(m.model || "-"),
      String(m.msgs),
      formatTokens(m.input ?? 0),
      formatTokens(m.output ?? 0),
      formatCost(m.cost ?? 0),
    ]);
    console.log(
      renderTable(headers, tableRows, ["left", "right", "right", "right", "right"])
        .split("\n")
        .map((l) => "  " + l)
        .join("\n"),
    );
  }

  console.log();
}
