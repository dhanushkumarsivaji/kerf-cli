import type Database from "better-sqlite3";
import { resolveModelPricing } from "./costCalculator.js";

export interface CacheStats {
  totalInputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  cacheHitRate: number;
  cacheCostUsd: number;
  nonCachedCostUsd: number;
  savingsFromCache: number;
  potentialAdditionalSavings: number;
}

export interface PoorCacheSession {
  sessionId: string;
  projectPath: string;
  totalCostUsd: number;
  cacheHitRate: number;
  potentialSavings: number;
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

export function computeCacheStats(
  db: Database.Database,
  period: string = "month",
  projectPath?: string,
  tool?: string,
): CacheStats {
  const filter = periodFilter(period);
  const projectClause = projectPath ? "AND project_path = ?" : "";
  const toolClause = tool ? "AND tool = ?" : "";
  const params: string[] = [];
  if (projectPath) params.push(projectPath);
  if (tool) params.push(tool);

  const row = db
    .prepare(
      `SELECT
        SUM(input_tokens) as input,
        SUM(cache_read_tokens) as cache_read,
        SUM(cache_creation_tokens) as cache_creation
       FROM messages WHERE ${filter} ${projectClause} ${toolClause}`,
    )
    .get(...params) as {
    input: number | null;
    cache_read: number | null;
    cache_creation: number | null;
  };

  const totalInputTokens = row.input ?? 0;
  const totalCacheReadTokens = row.cache_read ?? 0;
  const totalCacheCreationTokens = row.cache_creation ?? 0;

  const totalCacheable = totalInputTokens + totalCacheReadTokens + totalCacheCreationTokens;
  const cacheHitRate = totalCacheable > 0 ? totalCacheReadTokens / totalCacheable : 0;

  const pricing = resolveModelPricing("sonnet");
  const MILLION = 1_000_000;
  const cacheCostUsd = (totalCacheReadTokens * pricing.cacheRead) / MILLION;
  const nonCachedCostUsd = (totalInputTokens * pricing.input) / MILLION;
  const wouldHaveCost = (totalCacheReadTokens * pricing.input) / MILLION;
  const savingsFromCache = wouldHaveCost - cacheCostUsd;

  const targetHitRate = 0.8;
  const targetCacheReads = totalCacheable * targetHitRate;
  const additionalCacheable = Math.max(0, targetCacheReads - totalCacheReadTokens);
  const potentialAdditionalSavings =
    (additionalCacheable * (pricing.input - pricing.cacheRead)) / MILLION;

  return {
    totalInputTokens,
    totalCacheReadTokens,
    totalCacheCreationTokens,
    cacheHitRate,
    cacheCostUsd,
    nonCachedCostUsd,
    savingsFromCache,
    potentialAdditionalSavings,
  };
}

export function detectPoorCacheSessions(
  db: Database.Database,
  threshold: number = 0.3,
): PoorCacheSession[] {
  const rows = db
    .prepare(
      `SELECT
        session_id, project_path, total_cost_usd,
        total_input_tokens + total_cache_read + total_cache_creation as total_cacheable,
        total_cache_read
       FROM sessions_meta
       WHERE total_cost_usd > 1.0
       ORDER BY total_cost_usd DESC
       LIMIT 100`,
    )
    .all() as Array<{
    session_id: string;
    project_path: string;
    total_cost_usd: number;
    total_cacheable: number;
    total_cache_read: number;
  }>;

  const pricing = resolveModelPricing("sonnet");
  const MILLION = 1_000_000;

  return rows
    .map((r) => {
      const hitRate = r.total_cacheable > 0 ? r.total_cache_read / r.total_cacheable : 0;
      const targetCacheReads = r.total_cacheable * 0.8;
      const additional = Math.max(0, targetCacheReads - r.total_cache_read);
      const potentialSavings = (additional * (pricing.input - pricing.cacheRead)) / MILLION;
      return {
        sessionId: r.session_id,
        projectPath: r.project_path,
        totalCostUsd: r.total_cost_usd,
        cacheHitRate: hitRate,
        potentialSavings,
      };
    })
    .filter((s) => s.cacheHitRate < threshold)
    .sort((a, b) => b.potentialSavings - a.potentialSavings)
    .slice(0, 10);
}
