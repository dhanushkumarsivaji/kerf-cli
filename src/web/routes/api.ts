import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import type Database from "better-sqlite3";
import type { IngestService } from "../../core/ingest.js";
import { analyzeModelDistribution } from "../../core/efficiencyAnalyzer.js";
import { computeCacheStats } from "../../core/cacheReporter.js";
import { BudgetManager } from "../../core/budgetManager.js";

// Simple in-process cache (5s TTL) to protect against rapid polling
const queryCache = new Map<string, { at: number; value: unknown }>();
const CACHE_TTL_MS = 5_000;

function cached<T>(key: string, fn: () => T): T {
  const entry = queryCache.get(key);
  if (entry && Date.now() - entry.at < CACHE_TTL_MS) {
    return entry.value as T;
  }
  const value = fn();
  queryCache.set(key, { at: Date.now(), value });
  return value;
}

function invalidateCache(): void {
  queryCache.clear();
}

function periodSql(period: string): string {
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

function priorPeriodSql(period: string): string {
  switch (period) {
    case "today":
      return "timestamp >= date('now', '-1 day') AND timestamp < date('now')";
    case "week":
      return "timestamp >= date('now', '-14 days') AND timestamp < date('now', '-7 days')";
    case "month":
      return "timestamp >= date('now', '-60 days') AND timestamp < date('now', '-30 days')";
    default:
      return "0=1";
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

interface ReportRow {
  total_cost: number | null;
  total_messages: number | null;
  total_sessions: number | null;
  total_input: number | null;
  total_output: number | null;
  total_cache_read: number | null;
  total_cache_creation: number | null;
}

function buildReport(db: Database.Database, period: string): unknown {
  const filter = periodSql(period);
  const priorFilter = priorPeriodSql(period);

  const row = db
    .prepare(
      `SELECT
        SUM(cost_usd) as total_cost,
        COUNT(*) as total_messages,
        COUNT(DISTINCT session_id) as total_sessions,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        SUM(cache_read_tokens) as total_cache_read,
        SUM(cache_creation_tokens) as total_cache_creation
       FROM messages WHERE ${filter}`,
    )
    .get() as ReportRow;

  const prior = db
    .prepare(`SELECT SUM(cost_usd) as total_cost FROM messages WHERE ${priorFilter}`)
    .get() as { total_cost: number | null };

  const current = row.total_cost ?? 0;
  const previous = prior.total_cost ?? 0;
  const percentChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;

  const cacheable = (row.total_input ?? 0) + (row.total_cache_read ?? 0);
  const cacheHitRate = cacheable > 0 ? (row.total_cache_read ?? 0) / cacheable : 0;

  const topProjects = db
    .prepare(
      `SELECT project_path as path, SUM(cost_usd) as cost, COUNT(DISTINCT session_id) as session_count
       FROM messages WHERE ${filter}
       GROUP BY project_path ORDER BY cost DESC LIMIT 5`,
    )
    .all() as Array<{ path: string; cost: number; session_count: number }>;

  const modelRows = db
    .prepare(
      `SELECT model, SUM(cost_usd) as cost FROM messages WHERE ${filter} GROUP BY model ORDER BY cost DESC`,
    )
    .all() as Array<{ model: string; cost: number }>;

  const modelBreakdown = modelRows.map((m) => ({
    model: m.model,
    cost: m.cost,
    percentage: current > 0 ? (m.cost / current) * 100 : 0,
  }));

  const efficiency = analyzeModelDistribution(db, period);
  const cache = computeCacheStats(db, period);

  const hourly = db
    .prepare(
      `SELECT strftime('%Y-%m-%d %H:00', timestamp) as bucket, SUM(cost_usd) as cost
       FROM messages WHERE ${filter}
       GROUP BY bucket ORDER BY bucket`,
    )
    .all() as Array<{ bucket: string; cost: number }>;

  return {
    period,
    totalCost: current,
    totalMessages: row.total_messages ?? 0,
    totalSessions: row.total_sessions ?? 0,
    totalInputTokens: row.total_input ?? 0,
    totalOutputTokens: row.total_output ?? 0,
    totalCacheRead: row.total_cache_read ?? 0,
    totalCacheCreation: row.total_cache_creation ?? 0,
    cacheHitRate,
    costTrend: { current, previous, percentChange },
    topProjects,
    modelBreakdown,
    efficiency,
    cache,
    hourly,
  };
}

function buildCostTrend(db: Database.Database, period: string): unknown {
  const filter = periodSql(period);
  const groupBy =
    period === "today"
      ? "strftime('%Y-%m-%d %H:00', timestamp)"
      : period === "all"
        ? "strftime('%Y-%W', timestamp)"
        : "date(timestamp)";

  const rows = db
    .prepare(
      `SELECT ${groupBy} as bucket,
              SUM(CASE WHEN model LIKE '%opus%' THEN cost_usd ELSE 0 END) as opus,
              SUM(CASE WHEN model LIKE '%sonnet%' THEN cost_usd ELSE 0 END) as sonnet,
              SUM(CASE WHEN model LIKE '%haiku%' THEN cost_usd ELSE 0 END) as haiku,
              SUM(CASE WHEN model NOT LIKE '%opus%' AND model NOT LIKE '%sonnet%' AND model NOT LIKE '%haiku%' THEN cost_usd ELSE 0 END) as other,
              SUM(cost_usd) as total
       FROM messages WHERE ${filter}
       GROUP BY bucket ORDER BY bucket`,
    )
    .all();

  return rows;
}

interface SessionRow {
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
}

function buildSessions(db: Database.Database, params: URLSearchParams): unknown {
  const limit = Math.min(200, parseInt(params.get("limit") ?? "20", 10));
  const offset = Math.max(0, parseInt(params.get("offset") ?? "0", 10));
  const project = params.get("project");
  const sort = params.get("sort") ?? "recent";
  const order = params.get("order") ?? "desc";

  const sortCol =
    sort === "cost"
      ? "total_cost_usd"
      : sort === "messages"
        ? "message_count"
        : sort === "duration"
          ? "(julianday(last_message_at) - julianday(first_message_at))"
          : "last_message_at";
  const sortDir = order === "asc" ? "ASC" : "DESC";

  const where = project ? "WHERE project_path = ?" : "";
  const args = project ? [project] : [];

  const total = db
    .prepare(`SELECT COUNT(*) as c FROM sessions_meta ${where}`)
    .get(...args) as { c: number };

  const rows = db
    .prepare(
      `SELECT * FROM sessions_meta ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, offset) as SessionRow[];

  return {
    total: total.c,
    limit,
    offset,
    sessions: rows.map((r) => ({
      sessionId: r.session_id,
      projectPath: r.project_path,
      firstMessageAt: r.first_message_at,
      lastMessageAt: r.last_message_at,
      messageCount: r.message_count,
      totalInputTokens: r.total_input_tokens,
      totalOutputTokens: r.total_output_tokens,
      totalCacheRead: r.total_cache_read,
      totalCacheCreation: r.total_cache_creation,
      totalCostUsd: r.total_cost_usd,
      models: (() => {
        try {
          return JSON.parse(r.models) as string[];
        } catch {
          return [];
        }
      })(),
    })),
  };
}

function buildSessionDetail(db: Database.Database, sessionId: string): unknown {
  const meta = db
    .prepare(`SELECT * FROM sessions_meta WHERE session_id = ?`)
    .get(sessionId) as SessionRow | undefined;

  if (!meta) return null;

  const messages = db
    .prepare(
      `SELECT message_id, model, timestamp, input_tokens, output_tokens,
              cache_read_tokens, cache_creation_tokens, cost_usd
       FROM messages WHERE session_id = ? ORDER BY timestamp LIMIT 500`,
    )
    .all(sessionId);

  const modelBreakdown = db
    .prepare(
      `SELECT model, SUM(cost_usd) as cost, COUNT(*) as messages
       FROM messages WHERE session_id = ? GROUP BY model`,
    )
    .all(sessionId);

  return { meta, messages, modelBreakdown };
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database.Database,
  ingest: IngestService,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const params = url.searchParams;
  const period = params.get("period") ?? "today";

  try {
    if (path === "/api/report") {
      const data = cached(`report:${period}`, () => buildReport(db, period));
      sendJson(res, 200, data);
      return;
    }

    if (path === "/api/cost-trend") {
      const data = cached(`cost-trend:${period}`, () => buildCostTrend(db, period));
      sendJson(res, 200, data);
      return;
    }

    if (path === "/api/sessions") {
      const data = cached(`sessions:${params.toString()}`, () => buildSessions(db, params));
      sendJson(res, 200, data);
      return;
    }

    const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const data = buildSessionDetail(db, sessionMatch[1]);
      if (!data) {
        sendJson(res, 404, { error: "Session not found" });
        return;
      }
      sendJson(res, 200, data);
      return;
    }

    if (path === "/api/efficiency") {
      const data = cached(`efficiency:${period}`, () => analyzeModelDistribution(db, period));
      sendJson(res, 200, data);
      return;
    }

    if (path === "/api/cache") {
      const data = cached(`cache:${period}`, () => computeCacheStats(db, period));
      sendJson(res, 200, data);
      return;
    }

    if (path === "/api/budget") {
      const manager = new BudgetManager();
      const status = manager.checkBudget(process.cwd());
      manager.close();
      sendJson(res, 200, { status });
      return;
    }

    if (path === "/api/sync" && req.method === "POST") {
      invalidateCache();
      const stats = await ingest.ingestAll();
      sendJson(res, 200, stats);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[kerf] API error:", err);
    sendJson(res, 500, { error: "Internal server error" });
  }
}
