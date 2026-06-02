import type Database from "better-sqlite3";
import { checkReadOnlySql } from "../core/sqlGuard.js";
import { analyzeModelDistribution } from "../core/efficiencyAnalyzer.js";
import { analyzeCrossTool } from "../core/crossToolAnalyzer.js";
import { forecastSpend } from "../core/forecaster.js";
import { BudgetManager } from "../core/budgetManager.js";

/** JSON-Schema definitions advertised to MCP clients (ListTools). */
export const MCP_TOOLS = [
  {
    name: "kerf_summary",
    description:
      "Cost summary from kerf's local analytics DB. Returns totals plus per-model and per-tool breakdowns for a time period.",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "week", "month", "all"],
          description: "Time window (default: today)",
        },
        tool: {
          type: "string",
          description: "Filter to a tool id (e.g. claude-code, codex)",
        },
        project: { type: "string", description: "Filter to a project path" },
      },
    },
  },
  {
    name: "kerf_query",
    description:
      "Run a READ-ONLY SQL query against kerf's analytics database (tables: messages, sessions_meta, daily_summaries). Write statements are rejected.",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "A read-only SELECT query" },
      },
      required: ["sql"],
    },
  },
  {
    name: "kerf_efficiency",
    description:
      "Model-usage efficiency report plus cross-tool/cross-model optimization recommendations (estimated savings).",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "week", "month", "all"] },
        tool: { type: "string", description: "Filter to a tool id" },
      },
    },
  },
  {
    name: "kerf_forecast",
    description:
      "Project total spend for the current week or month from run-rate, compared to typical prior periods.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["week", "month"] },
      },
    },
  },
  {
    name: "kerf_budget_status",
    description:
      "Current budget usage. With a project path, returns that project's budget status; otherwise lists all projects with budgets.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project path (optional)" },
      },
    },
  },
] as const;

export type McpToolName = (typeof MCP_TOOLS)[number]["name"];

const VALID_PERIODS = ["today", "week", "month", "all"] as const;
const MAX_QUERY_ROWS = 500;

function periodFilter(period: string): string {
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

function summary(
  db: Database.Database,
  args: { period?: string; tool?: string; project?: string },
): unknown {
  const period = args.period ?? "today";
  if (!VALID_PERIODS.includes(period as never)) {
    throw new Error(`Invalid period: ${period}. Use today|week|month|all.`);
  }
  let where = periodFilter(period);
  const params: unknown[] = [];
  if (args.project) {
    where += " AND project_path = ?";
    params.push(args.project);
  }
  if (args.tool) {
    where += " AND tool = ?";
    params.push(args.tool);
  }

  const totals = db
    .prepare(
      `SELECT
        COALESCE(SUM(cost_usd), 0) as cost_usd,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(cache_creation_tokens), 0) as cache_creation_tokens,
        COUNT(*) as message_count,
        COUNT(DISTINCT session_id) as session_count
       FROM messages WHERE ${where}`,
    )
    .get(...params);

  const byModel = db
    .prepare(
      `SELECT model, ROUND(SUM(cost_usd), 4) as cost_usd, COUNT(*) as messages
       FROM messages WHERE ${where} GROUP BY model ORDER BY cost_usd DESC`,
    )
    .all(...params);

  const byTool = db
    .prepare(
      `SELECT tool, ROUND(SUM(cost_usd), 4) as cost_usd, COUNT(DISTINCT session_id) as sessions
       FROM messages WHERE ${where} GROUP BY tool ORDER BY cost_usd DESC`,
    )
    .all(...params);

  return {
    period,
    tool: args.tool ?? null,
    project: args.project ?? null,
    totals,
    byModel,
    byTool,
  };
}

function query(db: Database.Database, args: { sql?: string }): unknown {
  const sql = args.sql;
  if (typeof sql !== "string" || sql.trim() === "") {
    throw new Error("kerf_query requires a non-empty 'sql' string.");
  }
  const guard = checkReadOnlySql(sql);
  if (!guard.ok) {
    throw new Error(
      `kerf_query is read-only. Rejected statement: ${guard.rejected}`,
    );
  }
  const stmt = db.prepare(sql);
  const allRows = stmt.all() as Record<string, unknown>[];
  const truncated = allRows.length > MAX_QUERY_ROWS;
  const rows = truncated ? allRows.slice(0, MAX_QUERY_ROWS) : allRows;
  const columns =
    rows.length > 0 ? Object.keys(rows[0]!) : (stmt.columns?.().map((c) => c.name) ?? []);
  return { columns, rowCount: allRows.length, truncated, rows };
}

function efficiency(
  db: Database.Database,
  args: { period?: string; tool?: string },
): unknown {
  const period = args.period ?? "month";
  if (!VALID_PERIODS.includes(period as never)) {
    throw new Error(`Invalid period: ${period}. Use today|week|month|all.`);
  }
  const report = analyzeModelDistribution(db, period, undefined, args.tool);
  const crossToolRecommendations = analyzeCrossTool(db);
  return { report, crossToolRecommendations };
}

function forecast(db: Database.Database, args: { period?: string }): unknown {
  const period = args.period ?? "month";
  if (period !== "week" && period !== "month") {
    throw new Error(`Invalid period: ${period}. Use week|month.`);
  }
  return forecastSpend(db, period);
}

function budgetStatus(args: { project?: string }): unknown {
  const manager = new BudgetManager();
  try {
    if (args.project) {
      const status = manager.checkBudget(args.project);
      return { project: args.project, status };
    }
    return { projects: manager.listProjects() };
  } finally {
    manager.close();
  }
}

/**
 * Dispatch an MCP tool call. Returns plain JSON-serializable data.
 * Throws on unknown tool or invalid arguments — callers map that to an MCP error.
 */
export function runTool(
  db: Database.Database,
  name: string,
  args: Record<string, unknown> = {},
): unknown {
  switch (name) {
    case "kerf_summary":
      return summary(db, args);
    case "kerf_query":
      return query(db, args);
    case "kerf_efficiency":
      return efficiency(db, args);
    case "kerf_forecast":
      return forecast(db, args);
    case "kerf_budget_status":
      return budgetStatus(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
