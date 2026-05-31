import { Command } from "commander";
import chalk from "chalk";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import { IngestService } from "../../core/ingest.js";
import { formatCost, formatTokens } from "../../core/costCalculator.js";
import { forecastSpend } from "../../core/forecaster.js";

type Period = "today" | "week" | "month" | "all";

function periodFilter(period: Period): string {
  switch (period) {
    case "today":
      return "timestamp >= date('now')";
    case "week":
      return "timestamp >= date('now', '-7 days')";
    case "month":
      return "timestamp >= date('now', '-30 days')";
    case "all":
    default:
      return "1=1";
  }
}

interface TotalsRow {
  total_cost: number | null;
  total_input: number | null;
  total_output: number | null;
  total_cache_read: number | null;
  total_cache_creation: number | null;
  message_count: number;
  session_count: number;
}

function pad(str: string, width: number, align: "left" | "right" = "left"): string {
  if (str.length >= width) return str;
  const padding = " ".repeat(width - str.length);
  return align === "left" ? str + padding : padding + str;
}

function renderTable(headers: string[], rows: string[][], aligns: ("left" | "right")[]): string {
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

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (s: string) =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

export function registerSummaryCommand(program: Command): void {
  program
    .command("summary")
    .description("Show cost summary from kerf's analytics database")
    .option("--period <period>", "Time period (today|week|month|all)", "today")
    .option("--project <path>", "Filter by project path")
    .option("--tool <tool>", "Filter by tool (claude-code, codex, …)")
    .option("--model", "Show per-model breakdown")
    .option("--by-project", "Show per-project breakdown")
    .option("--by-tool", "Show per-tool breakdown across all your AI coding agents")
    .option("--no-sync", "Skip auto-sync before querying")
    .option("--json", "Output as JSON")
    .option("--csv", "Output as CSV")
    .action(async (opts) => {
      const period = (opts.period as Period) ?? "today";
      if (!["today", "week", "month", "all"].includes(period)) {
        console.error(chalk.red(`Invalid period: ${period}. Use today|week|month|all.`));
        process.exit(1);
      }

      const db = initDatabase();
      runMigrations(db);

      try {
        if (opts.sync !== false) {
          const ingest = new IngestService(db);
          await ingest.ingestAll();
        }

        const filter = periodFilter(period);
        const params: unknown[] = [];
        let where = filter;
        if (opts.project) {
          where += " AND project_path = ?";
          params.push(opts.project);
        }
        if (opts.tool) {
          where += " AND tool = ?";
          params.push(opts.tool);
        }

        const totals = db
          .prepare(
            `SELECT
              SUM(cost_usd) as total_cost,
              SUM(input_tokens) as total_input,
              SUM(output_tokens) as total_output,
              SUM(cache_read_tokens) as total_cache_read,
              SUM(cache_creation_tokens) as total_cache_creation,
              COUNT(*) as message_count,
              COUNT(DISTINCT session_id) as session_count
            FROM messages WHERE ${where}`,
          )
          .get(...params) as TotalsRow;

        const modelRows = opts.model
          ? (db
              .prepare(
                `SELECT model, SUM(cost_usd) as cost, COUNT(*) as msgs
                 FROM messages WHERE ${where}
                 GROUP BY model ORDER BY cost DESC`,
              )
              .all(...params) as Array<{ model: string; cost: number; msgs: number }>)
          : [];

        const projectRows = opts.byProject
          ? (db
              .prepare(
                `SELECT project_path, SUM(cost_usd) as cost, COUNT(DISTINCT session_id) as sessions
                 FROM messages WHERE ${where}
                 GROUP BY project_path ORDER BY cost DESC`,
              )
              .all(...params) as Array<{ project_path: string; cost: number; sessions: number }>)
          : [];

        const toolRows = opts.byTool
          ? (db
              .prepare(
                `SELECT tool, SUM(cost_usd) as cost, COUNT(DISTINCT session_id) as sessions
                 FROM messages WHERE ${where}
                 GROUP BY tool ORDER BY cost DESC`,
              )
              .all(...params) as Array<{ tool: string; cost: number; sessions: number }>)
          : [];

        const isEmpty = !totals || totals.message_count === 0;

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                period,
                project: opts.project ?? null,
                totals: {
                  cost_usd: totals?.total_cost ?? 0,
                  input_tokens: totals?.total_input ?? 0,
                  output_tokens: totals?.total_output ?? 0,
                  cache_read_tokens: totals?.total_cache_read ?? 0,
                  cache_creation_tokens: totals?.total_cache_creation ?? 0,
                  message_count: totals?.message_count ?? 0,
                  session_count: totals?.session_count ?? 0,
                },
                models: modelRows,
                projects: projectRows,
                tools: toolRows,
              },
              null,
              2,
            ),
          );
          return;
        }

        if (opts.csv) {
          const headers = [
            "period",
            "cost_usd",
            "input_tokens",
            "output_tokens",
            "cache_read",
            "cache_creation",
            "messages",
            "sessions",
          ];
          const row = [
            period,
            String(totals?.total_cost ?? 0),
            String(totals?.total_input ?? 0),
            String(totals?.total_output ?? 0),
            String(totals?.total_cache_read ?? 0),
            String(totals?.total_cache_creation ?? 0),
            String(totals?.message_count ?? 0),
            String(totals?.session_count ?? 0),
          ];
          console.log(toCsv(headers, [row]));

          if (opts.model && modelRows.length > 0) {
            console.log();
            console.log(
              toCsv(
                ["model", "cost_usd", "messages"],
                modelRows.map((r) => [r.model, String(r.cost), String(r.msgs)]),
              ),
            );
          }
          if (opts.byProject && projectRows.length > 0) {
            console.log();
            console.log(
              toCsv(
                ["project_path", "cost_usd", "sessions"],
                projectRows.map((r) => [r.project_path, String(r.cost), String(r.sessions)]),
              ),
            );
          }
          if (opts.byTool && toolRows.length > 0) {
            console.log();
            console.log(
              toCsv(
                ["tool", "cost_usd", "sessions"],
                toolRows.map((r) => [r.tool, String(r.cost), String(r.sessions)]),
              ),
            );
          }
          return;
        }

        if (isEmpty) {
          console.log(
            chalk.yellow(`No data for period: ${period}. Run kerf sync first.`),
          );
          return;
        }

        console.log(chalk.bold.cyan(`\n  kerf summary — ${period}${opts.project ? ` (${opts.project})` : ""}\n`));
        console.log(`  Cost:      ${chalk.green(formatCost(totals.total_cost ?? 0))}`);
        console.log(`  Messages:  ${totals.message_count}`);
        console.log(`  Sessions:  ${totals.session_count}`);
        console.log(`  Input:     ${formatTokens(totals.total_input ?? 0)}`);
        console.log(`  Output:    ${formatTokens(totals.total_output ?? 0)}`);
        console.log(`  Cache rd:  ${formatTokens(totals.total_cache_read ?? 0)}`);
        console.log(`  Cache wr:  ${formatTokens(totals.total_cache_creation ?? 0)}`);

        if (opts.model && modelRows.length > 0) {
          console.log(chalk.bold("\n  By model:\n"));
          const headers = ["Model", "Cost", "Messages"];
          const rows = modelRows.map((r) => [
            r.model,
            formatCost(r.cost),
            String(r.msgs),
          ]);
          console.log(
            renderTable(headers, rows, ["left", "right", "right"])
              .split("\n")
              .map((l) => "  " + l)
              .join("\n"),
          );
        }

        if (opts.byProject && projectRows.length > 0) {
          console.log(chalk.bold("\n  By project:\n"));
          const headers = ["Project", "Cost", "Sessions"];
          const rows = projectRows.map((r) => [
            r.project_path,
            formatCost(r.cost),
            String(r.sessions),
          ]);
          console.log(
            renderTable(headers, rows, ["left", "right", "right"])
              .split("\n")
              .map((l) => "  " + l)
              .join("\n"),
          );
        }

        if (opts.byTool && toolRows.length > 0) {
          const grandTotal = toolRows.reduce((sum, r) => sum + (r.cost ?? 0), 0);
          console.log(chalk.bold("\n  By tool:\n"));
          const headers = ["Tool", "Cost", "Share", "Sessions"];
          const rows = toolRows.map((r) => [
            r.tool,
            formatCost(r.cost),
            grandTotal > 0 ? `${((r.cost / grandTotal) * 100).toFixed(0)}%` : "-",
            String(r.sessions),
          ]);
          console.log(
            renderTable(headers, rows, ["left", "right", "right", "right"])
              .split("\n")
              .map((l) => "  " + l)
              .join("\n"),
          );
        }

        // One-line spend projection for week/month views.
        if (period === "week" || period === "month") {
          const forecast = forecastSpend(db, period);
          if (forecast.projectedTotal > 0) {
            const vs =
              forecast.vsTypical !== 0
                ? ` ${
                    forecast.vsTypical > 0
                      ? chalk.yellow(`(↑ ${Math.abs(forecast.vsTypical).toFixed(0)}% above your usual)`)
                      : chalk.green(`(↓ ${Math.abs(forecast.vsTypical).toFixed(0)}% below your usual)`)
                  }`
                : "";
            console.log(
              chalk.dim(`\n  Projected ${period}: `) +
                chalk.bold(formatCost(forecast.projectedTotal)) +
                vs,
            );
          }
        }

        console.log();
      } finally {
        db.close();
      }
    });
}
