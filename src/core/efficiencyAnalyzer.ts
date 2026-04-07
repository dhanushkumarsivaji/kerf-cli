import type Database from "better-sqlite3";
import { resolveModelPricing } from "./costCalculator.js";

export interface EfficiencyReport {
  totalCostUsd: number;
  byModel: Array<{
    model: string;
    costUsd: number;
    percentOfTotal: number;
    messageCount: number;
    sessionCount: number;
  }>;
  opusOverusePercent: number;
  estimatedSavings: {
    switchOpusToSonnet: { savedUsd: number; percentSaved: number };
    switchOpusToHaiku: { savedUsd: number; percentSaved: number };
  };
}

export interface ExpensiveSession {
  sessionId: string;
  projectPath: string;
  totalCostUsd: number;
  messageCount: number;
  modelBreakdown: Record<string, number>;
  looksSimple: boolean;
}

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

function classifyModel(model: string): "opus" | "sonnet" | "haiku" | "unknown" {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("haiku")) return "haiku";
  return "unknown";
}

export function analyzeModelDistribution(
  db: Database.Database,
  period: string = "month",
  projectPath?: string,
): EfficiencyReport {
  const filter = periodFilter(period);
  const projectClause = projectPath ? "AND project_path = ?" : "";
  const params: string[] = projectPath ? [projectPath] : [];

  const totalRow = db
    .prepare(`SELECT SUM(cost_usd) as total FROM messages WHERE ${filter} ${projectClause}`)
    .get(...params) as { total: number | null };
  const totalCostUsd = totalRow.total ?? 0;

  const rows = db
    .prepare(
      `SELECT model, SUM(cost_usd) as cost, SUM(input_tokens) as input, SUM(output_tokens) as output,
              SUM(cache_read_tokens) as cache_read, SUM(cache_creation_tokens) as cache_creation,
              COUNT(*) as messages, COUNT(DISTINCT session_id) as sessions
       FROM messages WHERE ${filter} ${projectClause}
       GROUP BY model ORDER BY cost DESC`,
    )
    .all(...params) as Array<{
    model: string;
    cost: number;
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
    messages: number;
    sessions: number;
  }>;

  const byModel = rows.map((r) => ({
    model: classifyModel(r.model),
    costUsd: r.cost,
    percentOfTotal: totalCostUsd > 0 ? (r.cost / totalCostUsd) * 100 : 0,
    messageCount: r.messages,
    sessionCount: r.sessions,
  }));

  const opusRow = rows.find((r) => classifyModel(r.model) === "opus");
  const opusOverusePercent =
    opusRow && totalCostUsd > 0 ? (opusRow.cost / totalCostUsd) * 100 : 0;

  let switchOpusToSonnetSaved = 0;
  if (opusRow) {
    // Use the stored opus cost as actual; compute the sonnet equivalent
    // using the ratio of sonnet:opus pricing on the same token mix
    const opusPricing = resolveModelPricing("claude-opus-4-20250514");
    const sonnetPricing = resolveModelPricing("claude-sonnet-4-20250514");
    const MILLION = 1_000_000;
    const opusEquivalent =
      (opusRow.input * opusPricing.input) / MILLION +
      (opusRow.output * opusPricing.output) / MILLION +
      (opusRow.cache_read * opusPricing.cacheRead) / MILLION +
      (opusRow.cache_creation * opusPricing.cacheCreation) / MILLION;
    const sonnetEquivalent =
      (opusRow.input * sonnetPricing.input) / MILLION +
      (opusRow.output * sonnetPricing.output) / MILLION +
      (opusRow.cache_read * sonnetPricing.cacheRead) / MILLION +
      (opusRow.cache_creation * sonnetPricing.cacheCreation) / MILLION;
    // Scale by the actual recorded cost (handles edge cases where token math diverges from stored cost)
    const ratio = opusEquivalent > 0 ? sonnetEquivalent / opusEquivalent : 0.2;
    const sonnetActual = opusRow.cost * ratio;
    switchOpusToSonnetSaved = Math.max(0, opusRow.cost - sonnetActual);
  }

  const simpleOpusRow = db
    .prepare(
      `SELECT SUM(cost_usd) as cost, SUM(input_tokens) as input, SUM(output_tokens) as output
       FROM messages WHERE ${filter} ${projectClause}
       AND model LIKE '%opus%'
       AND session_id IN (
         SELECT session_id FROM messages
         WHERE ${filter} ${projectClause}
         GROUP BY session_id
         HAVING AVG(input_tokens) < 5000 AND SUM(cache_creation_tokens) = 0
       )`,
    )
    .get(...params, ...params) as {
    cost: number | null;
    input: number | null;
    output: number | null;
  };

  let switchOpusToHaikuSaved = 0;
  if (simpleOpusRow.cost) {
    const haikuPricing = resolveModelPricing("haiku");
    const MILLION = 1_000_000;
    const opusActual = simpleOpusRow.cost;
    const haikuEquivalent =
      ((simpleOpusRow.input ?? 0) * haikuPricing.input) / MILLION +
      ((simpleOpusRow.output ?? 0) * haikuPricing.output) / MILLION;
    switchOpusToHaikuSaved = Math.max(0, opusActual - haikuEquivalent);
  }

  return {
    totalCostUsd,
    byModel,
    opusOverusePercent,
    estimatedSavings: {
      switchOpusToSonnet: {
        savedUsd: switchOpusToSonnetSaved,
        percentSaved: totalCostUsd > 0 ? (switchOpusToSonnetSaved / totalCostUsd) * 100 : 0,
      },
      switchOpusToHaiku: {
        savedUsd: switchOpusToHaikuSaved,
        percentSaved: totalCostUsd > 0 ? (switchOpusToHaikuSaved / totalCostUsd) * 100 : 0,
      },
    },
  };
}

export function detectExpensiveSessions(
  db: Database.Database,
  threshold: number = 5.0,
): ExpensiveSession[] {
  const rows = db
    .prepare(
      `SELECT session_id, project_path, total_cost_usd, message_count, models
       FROM sessions_meta WHERE total_cost_usd > ? ORDER BY total_cost_usd DESC LIMIT 20`,
    )
    .all(threshold) as Array<{
    session_id: string;
    project_path: string;
    total_cost_usd: number;
    message_count: number;
    models: string;
  }>;

  return rows.map((r) => {
    const breakdown = db
      .prepare(
        `SELECT model, SUM(cost_usd) as cost FROM messages WHERE session_id = ? GROUP BY model`,
      )
      .all(r.session_id) as Array<{ model: string; cost: number }>;
    const modelBreakdown = Object.fromEntries(breakdown.map((b) => [b.model, b.cost]));

    const looksSimple = r.message_count < 30;

    return {
      sessionId: r.session_id,
      projectPath: r.project_path,
      totalCostUsd: r.total_cost_usd,
      messageCount: r.message_count,
      modelBreakdown,
      looksSimple,
    };
  });
}
