import type Database from "better-sqlite3";
import { resolveModelPricing } from "./costCalculator.js";
import { analyzeModelDistribution } from "./efficiencyAnalyzer.js";

export interface CrossToolRecommendation {
  kind: "model_downgrade" | "tool_consolidation" | "cache_optimization";
  description: string;
  estimatedMonthlySavings: number;
  /** Human-readable evidence, e.g. "18 sessions in Claude Code/Opus, low complexity". */
  evidence: string;
}

const MILLION = 1_000_000;
const WINDOW = "timestamp >= date('now', '-30 days')";

/** Whether the messages table carries a `tool` column (multi-tool builds, Phases A–C). */
function hasToolColumn(db: Database.Database): boolean {
  const cols = db.prepare(`PRAGMA table_info(messages)`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === "tool");
}

/** Model-downgrade opportunity within the data (Opus → Sonnet on routine traffic). */
function modelDowngradeRec(db: Database.Database): CrossToolRecommendation | null {
  const report = analyzeModelDistribution(db, "month");
  const saved = report.estimatedSavings.switchOpusToSonnet.savedUsd;
  if (saved < 1) return null;

  const opus = db
    .prepare(
      `SELECT COUNT(*) as msgs, COUNT(DISTINCT session_id) as sessions
       FROM messages WHERE ${WINDOW} AND model LIKE '%opus%'`,
    )
    .get() as { msgs: number; sessions: number };

  return {
    kind: "model_downgrade",
    description: `Routing Opus traffic to Sonnet would save ~$${saved.toFixed(2)}/month at current usage.`,
    estimatedMonthlySavings: saved,
    evidence: `${opus.msgs} Opus messages across ${opus.sessions} sessions in the last 30 days`,
  };
}

/** Cache-optimization opportunity: models whose low cache hit-rate is inflating cost. */
function cacheOptimizationRecs(db: Database.Database): CrossToolRecommendation[] {
  const rows = db
    .prepare(
      `SELECT model,
        SUM(cache_read_tokens) as cache_read,
        SUM(input_tokens) as input,
        SUM(cost_usd) as cost
       FROM messages WHERE ${WINDOW}
       GROUP BY model`,
    )
    .all() as Array<{ model: string; cache_read: number; input: number; cost: number }>;

  const recs: CrossToolRecommendation[] = [];
  const TARGET_HIT_RATE = 0.5;

  for (const r of rows) {
    const cacheable = r.cache_read + r.input;
    if (cacheable < 50_000 || r.cost < 1) continue;
    const hitRate = cacheable > 0 ? r.cache_read / cacheable : 0;
    if (hitRate >= 0.3) continue;

    // Moving the gap up to TARGET_HIT_RATE shifts tokens from input price to cache-read price.
    const pricing = resolveModelPricing(r.model);
    const movedTokens = (TARGET_HIT_RATE - hitRate) * cacheable;
    const perTokenSaving = (pricing.input - pricing.cacheRead) / MILLION;
    const savings = Math.max(0, movedTokens * perTokenSaving);
    if (savings < 1) continue;

    recs.push({
      kind: "cache_optimization",
      description: `Cache hit rate on ${r.model} is only ${(hitRate * 100).toFixed(0)}%. Keeping sessions warmer (fewer cold restarts) could save ~$${savings.toFixed(2)}/month.`,
      estimatedMonthlySavings: savings,
      evidence: `${(hitRate * 100).toFixed(0)}% hit rate over ${(cacheable / 1_000_000).toFixed(1)}M cacheable tokens`,
    });
  }

  return recs;
}

/**
 * Tool-consolidation opportunity — only available once multi-tool support
 * (a `tool` column, Phases A–C) exists. Identifies routine work being done on
 * an expensive tool that another tool the user already uses does cheaper.
 */
function toolConsolidationRecs(db: Database.Database): CrossToolRecommendation[] {
  if (!hasToolColumn(db)) return [];

  // Per-tool routine spend: low average input, no cache-creation (matches efficiency heuristic).
  const rows = db
    .prepare(
      `SELECT tool,
        SUM(cost_usd) as cost,
        COUNT(*) as msgs
       FROM messages
       WHERE ${WINDOW}
       AND session_id IN (
         SELECT session_id FROM messages WHERE ${WINDOW}
         GROUP BY session_id
         HAVING AVG(input_tokens) < 5000 AND SUM(cache_creation_tokens) = 0
       )
       GROUP BY tool
       HAVING msgs > 0`,
    )
    .all() as Array<{ tool: string; cost: number; msgs: number }>;

  if (rows.length < 2) return [];

  const withRate = rows.map((r) => ({ ...r, rate: r.cost / r.msgs }));
  const cheapest = withRate.reduce((a, b) => (b.rate < a.rate ? b : a));

  const recs: CrossToolRecommendation[] = [];
  for (const r of withRate) {
    if (r.tool === cheapest.tool) continue;
    if (r.rate <= cheapest.rate) continue;
    const savings = r.msgs * (r.rate - cheapest.rate);
    if (savings < 1) continue;
    recs.push({
      kind: "tool_consolidation",
      description: `Routine work in ${r.tool} costs ~$${r.rate.toFixed(4)}/msg vs ~$${cheapest.rate.toFixed(4)}/msg in ${cheapest.tool}. Consolidating could save ~$${savings.toFixed(2)}/month.`,
      estimatedMonthlySavings: savings,
      evidence: `${r.msgs} routine messages in ${r.tool} at a higher per-message rate than ${cheapest.tool}`,
    });
  }

  return recs;
}

/**
 * Analyze usage across all tools/models and produce ranked optimization
 * recommendations. On single-tool installs this surfaces model-downgrade and
 * cache-optimization recs; tool-consolidation activates once multi-tool data exists.
 */
export function analyzeCrossTool(db: Database.Database): CrossToolRecommendation[] {
  const recs: CrossToolRecommendation[] = [];

  const downgrade = modelDowngradeRec(db);
  if (downgrade) recs.push(downgrade);
  recs.push(...cacheOptimizationRecs(db));
  recs.push(...toolConsolidationRecs(db));

  return recs.sort((a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings);
}
