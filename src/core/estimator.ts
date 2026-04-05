import { existsSync, readFileSync } from "node:fs";
import { glob } from "glob";
import { estimateTokens, countFileTokens, estimateContextOverhead } from "./tokenCounter.js";
import { resolveModelPricing, formatCost } from "./costCalculator.js";
import { BILLING_WINDOW_HOURS } from "./config.js";
import type { CostEstimate, EstimateOptions } from "../types/config.js";

type TaskComplexity = "simple" | "medium" | "complex";

interface ComplexityProfile {
  turns: { low: number; expected: number; high: number };
  outputTokensPerTurn: number;
}

const COMPLEXITY_PROFILES: Record<TaskComplexity, ComplexityProfile> = {
  simple: { turns: { low: 2, expected: 3, high: 5 }, outputTokensPerTurn: 1000 },
  medium: { turns: { low: 5, expected: 10, high: 15 }, outputTokensPerTurn: 2000 },
  complex: { turns: { low: 15, expected: 25, high: 40 }, outputTokensPerTurn: 2500 },
};

const SIMPLE_KEYWORDS = ["typo", "rename", "fix typo", "update version", "change name", "remove unused", "delete"];
const COMPLEX_KEYWORDS = ["refactor", "rewrite", "new module", "implement", "build", "create", "migrate", "redesign", "overhaul", "architecture"];

function detectComplexity(taskDescription: string): TaskComplexity {
  const lower = taskDescription.toLowerCase();
  if (SIMPLE_KEYWORDS.some((k) => lower.includes(k))) return "simple";
  if (COMPLEX_KEYWORDS.some((k) => lower.includes(k))) return "complex";
  return "medium";
}

export async function estimateTaskCost(
  taskDescription: string,
  options: Partial<EstimateOptions> = {},
): Promise<CostEstimate> {
  const model = options.model ?? "sonnet";
  const cwd = options.cwd ?? process.cwd();
  const pricing = resolveModelPricing(model);
  const MILLION = 1_000_000;

  // Calculate context overhead
  const overhead = estimateContextOverhead();

  // Count file tokens
  let fileTokens = 0;
  let fileList = options.files ?? [];

  if (fileList.length === 0) {
    // Try to auto-detect from git status
    try {
      const { execSync } = await import("node:child_process");
      const output = execSync("git diff --name-only HEAD 2>/dev/null || git ls-files -m 2>/dev/null", {
        cwd,
        encoding: "utf-8",
      });
      fileList = output
        .split("\n")
        .filter(Boolean)
        .map((f) => `${cwd}/${f}`);
    } catch {
      // No git, no files
    }
  }

  for (const filePattern of fileList) {
    const matched = await glob(filePattern, { cwd, absolute: true });
    for (const f of matched) {
      fileTokens += countFileTokens(f);
    }
  }

  // Detect complexity and get profile
  const complexity = detectComplexity(taskDescription);
  const profile = COMPLEXITY_PROFILES[complexity];

  // Calculate per-turn costs
  const contextPerTurn = overhead.totalOverhead + fileTokens;
  const CACHE_HIT_RATE = 0.9;

  function estimateCostForTurns(turns: number): number {
    let totalCost = 0;
    for (let turn = 1; turn <= turns; turn++) {
      const conversationGrowth = (turn - 1) * profile.outputTokensPerTurn;
      const inputTokens = contextPerTurn + conversationGrowth;

      let effectiveInputCost: number;
      if (turn <= 2) {
        // First turns: no cache
        effectiveInputCost = (inputTokens * pricing.input) / MILLION;
      } else {
        // After turn 2: 90% cache hit
        const cachedTokens = inputTokens * CACHE_HIT_RATE;
        const uncachedTokens = inputTokens * (1 - CACHE_HIT_RATE);
        effectiveInputCost =
          (cachedTokens * pricing.cacheRead) / MILLION +
          (uncachedTokens * pricing.input) / MILLION;
      }

      const outputCost = (profile.outputTokensPerTurn * pricing.output) / MILLION;
      totalCost += effectiveInputCost + outputCost;
    }
    return totalCost;
  }

  const lowCost = estimateCostForTurns(profile.turns.low);
  const expectedCost = estimateCostForTurns(profile.turns.expected);
  const highCost = estimateCostForTurns(profile.turns.high);

  // Estimate total tokens for expected case
  const expectedInputTokens = contextPerTurn * profile.turns.expected;
  const expectedOutputTokens = profile.outputTokensPerTurn * profile.turns.expected;
  const expectedCachedTokens = expectedInputTokens * CACHE_HIT_RATE;

  // Window usage
  const windowMinutes = BILLING_WINDOW_HOURS * 60;
  const percentOfWindow = (expectedCost / (expectedCost * 3)) * 100; // rough estimate

  // Recommendations
  const recommendations: string[] = [];
  if (model !== "sonnet") {
    const sonnetPricing = resolveModelPricing("sonnet");
    const sonnetCost = estimateCostForTurns(profile.turns.expected);
    // Recalculate with sonnet pricing isn't straightforward here,
    // so we do a ratio estimate
    const ratio = pricing.output / resolveModelPricing("sonnet").output;
    if (ratio > 2) {
      recommendations.push(
        `Consider Sonnet to save ~${formatCost(expectedCost - expectedCost / ratio)} (${ratio.toFixed(0)}x cheaper)`,
      );
    }
  }

  if (model === "sonnet") {
    const opusPricing = resolveModelPricing("opus");
    const ratio = opusPricing.output / pricing.output;
    recommendations.push(`Using Opus would cost ~${formatCost(expectedCost * ratio)} (${ratio.toFixed(0)}x more)`);
  }

  if (overhead.percentUsable < 60) {
    recommendations.push(`High ghost token overhead (${(100 - overhead.percentUsable).toFixed(0)}%). Run 'kerf-cli audit' to optimize.`);
  }

  if (fileTokens > 50000) {
    recommendations.push(`Large file context (${(fileTokens / 1000).toFixed(0)}K tokens). Consider narrowing scope.`);
  }

  return {
    model,
    estimatedTurns: profile.turns,
    estimatedTokens: {
      input: Math.round(expectedInputTokens),
      output: Math.round(expectedOutputTokens),
      cached: Math.round(expectedCachedTokens),
    },
    estimatedCost: {
      low: formatCost(lowCost),
      expected: formatCost(expectedCost),
      high: formatCost(highCost),
    },
    contextOverhead: overhead.totalOverhead,
    fileTokens,
    percentOfWindow: Math.round(percentOfWindow),
    recommendations,
  };
}
