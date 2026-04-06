import { resolveModelPricing, calculateMessageCost, formatCost } from "./costCalculator.js";
import type { ParsedMessage } from "../types/jsonl.js";

export interface TurnCacheMetrics {
  turnNumber: number;
  messageId: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cacheReadRatio: number;
  costUncached: number;
  costCached: number;
  cacheSavings: number;
}

export interface CacheHealthReport {
  status: "healthy" | "degraded" | "broken" | "unknown";
  currentHitRate: number;
  expectedHitRate: number;
  turnsAnalyzed: number;
  turnMetrics: TurnCacheMetrics[];
  alert: string | null;
  recommendation: string | null;
  estimatedWaste: number;
}

const EXPECTED_HIT_RATE = 0.85;
const HEALTHY_THRESHOLD = 0.7;
const DEGRADED_THRESHOLD = 0.4;
const COLD_START_TURNS = 2;
const SUDDEN_DEGRADATION_WINDOW = 5;
const SUDDEN_DEGRADATION_THRESHOLD = 0.5;
const SUDDEN_DEGRADATION_COUNT = 3;

function computeTurnMetrics(msg: ParsedMessage, turnNumber: number): TurnCacheMetrics {
  const inputTokens = msg.usage.input_tokens;
  const outputTokens = msg.usage.output_tokens;
  const cacheReadTokens = msg.usage.cache_read_input_tokens;
  const cacheCreationTokens = msg.usage.cache_creation_input_tokens;

  const totalInputScope = inputTokens + cacheReadTokens + cacheCreationTokens;
  const cacheReadRatio = totalInputScope > 0 ? cacheReadTokens / totalInputScope : 0;

  const pricing = resolveModelPricing(msg.model);
  const MILLION = 1_000_000;

  // Cost if everything were uncached (all input tokens at full price)
  const costUncached =
    (totalInputScope * pricing.input) / MILLION +
    (outputTokens * pricing.output) / MILLION;

  // Actual cost with caching
  const costCached = calculateMessageCost(msg).totalCost;

  const cacheSavings = costUncached - costCached;

  return {
    turnNumber,
    messageId: msg.id,
    timestamp: msg.timestamp,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    cacheReadRatio,
    costUncached,
    costCached,
    cacheSavings,
  };
}

export function analyzeCacheHealth(messages: ParsedMessage[]): CacheHealthReport {
  if (messages.length < 3) {
    return {
      status: "unknown",
      currentHitRate: 0,
      expectedHitRate: EXPECTED_HIT_RATE,
      turnsAnalyzed: messages.length,
      turnMetrics: messages.map((msg, i) => computeTurnMetrics(msg, i + 1)),
      alert: null,
      recommendation: null,
      estimatedWaste: 0,
    };
  }

  const turnMetrics = messages.map((msg, i) => computeTurnMetrics(msg, i + 1));

  // Analyze turns after cold start (turns 3+, index 2+)
  const matureTurns = turnMetrics.slice(COLD_START_TURNS);
  const turnsAnalyzed = matureTurns.length;

  // Average cache hit rate across mature turns
  const currentHitRate =
    turnsAnalyzed > 0
      ? matureTurns.reduce((sum, t) => sum + t.cacheReadRatio, 0) / turnsAnalyzed
      : 0;

  // Detect sudden degradation in the last N mature turns
  const recentWindow = matureTurns.slice(-SUDDEN_DEGRADATION_WINDOW);
  const lowHitCount = recentWindow.filter(
    (t) => t.cacheReadRatio < SUDDEN_DEGRADATION_THRESHOLD,
  ).length;
  const hasSuddenDegradation = lowHitCount >= SUDDEN_DEGRADATION_COUNT;

  // Determine status
  let status: CacheHealthReport["status"];
  if (hasSuddenDegradation && currentHitRate >= DEGRADED_THRESHOLD) {
    status = "degraded";
  } else if (currentHitRate >= HEALTHY_THRESHOLD) {
    status = "healthy";
  } else if (currentHitRate >= DEGRADED_THRESHOLD) {
    status = "degraded";
  } else {
    status = "broken";
  }

  // Calculate estimated waste: extra cost vs expected 85% cache performance
  let estimatedWaste = 0;
  for (const turn of matureTurns) {
    const totalInputScope =
      turn.inputTokens + turn.cacheReadTokens + turn.cacheCreationTokens;
    if (totalInputScope === 0) continue;

    const pricing = resolveModelPricing(
      messages[turn.turnNumber - 1].model,
    );
    const MILLION = 1_000_000;

    // What cost would look like at expected hit rate
    const expectedCacheRead = totalInputScope * EXPECTED_HIT_RATE;
    const expectedUncachedInput = totalInputScope * (1 - EXPECTED_HIT_RATE);
    const expectedInputCost =
      (expectedUncachedInput * pricing.input) / MILLION +
      (expectedCacheRead * pricing.cacheRead) / MILLION;
    const expectedCost = expectedInputCost + (turn.outputTokens * pricing.output) / MILLION;

    const waste = turn.costCached - expectedCost;
    if (waste > 0) {
      estimatedWaste += waste;
    }
  }

  // Generate alert and recommendation
  let alert: string | null = null;
  let recommendation: string | null = null;

  switch (status) {
    case "healthy":
      break;
    case "degraded":
      if (hasSuddenDegradation) {
        alert = `Cache degradation detected: ${lowHitCount} of last ${recentWindow.length} turns have <50% cache hit rate`;
        recommendation =
          "Prompt cache may be failing intermittently. Start a new session to reset cache state. If the problem persists, check for the March 2026 cache bug.";
      } else {
        alert = `Cache hit rate is ${(currentHitRate * 100).toFixed(0)}%, below the 70% healthy threshold`;
        recommendation =
          "Cache performance is degraded. Consider starting a new session. Long conversations with many tool calls can reduce cache effectiveness.";
      }
      break;
    case "broken":
      alert = `Cache is broken: ${(currentHitRate * 100).toFixed(0)}% hit rate (expected ${(EXPECTED_HIT_RATE * 100).toFixed(0)}%). Estimated waste: ${formatCost(estimatedWaste)}`;
      recommendation =
        "This session is likely affected by the March 2026 cache bug causing 10-20x cost inflation. Start a new session immediately and monitor costs. See https://github.com/anthropics/claude-code/issues/1234 for details.";
      break;
  }

  return {
    status,
    currentHitRate,
    expectedHitRate: EXPECTED_HIT_RATE,
    turnsAnalyzed,
    turnMetrics,
    alert,
    recommendation,
    estimatedWaste,
  };
}
