import { glob } from "glob";
import { countFileTokens, estimateContextOverhead } from "./tokenCounter.js";
import { resolveModelPricing, formatCost } from "./costCalculator.js";
import type { CostEstimate, EstimateOptions } from "../types/config.js";
import type { ModelPricing } from "../types/pricing.js";

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

// Typical 5-hour window costs per model (for percentOfWindow calculation)
const TYPICAL_WINDOW_COSTS: Record<string, number> = {
  sonnet: 15,
  opus: 75,
  haiku: 4,
};

function detectComplexity(taskDescription: string): TaskComplexity {
  const lower = taskDescription.toLowerCase();
  if (SIMPLE_KEYWORDS.some((k) => lower.includes(k))) return "simple";
  if (COMPLEX_KEYWORDS.some((k) => lower.includes(k))) return "complex";
  return "medium";
}

const MILLION = 1_000_000;
const CACHE_HIT_RATE = 0.9;

function estimateCostForTurns(
  turns: number,
  modelPricing: ModelPricing,
  contextPerTurn: number,
  outputTokensPerTurn: number,
): number {
  let totalCost = 0;
  for (let turn = 1; turn <= turns; turn++) {
    const conversationGrowth = (turn - 1) * outputTokensPerTurn;
    const inputTokens = contextPerTurn + conversationGrowth;

    let effectiveInputCost: number;
    if (turn <= 2) {
      effectiveInputCost = (inputTokens * modelPricing.input) / MILLION;
    } else {
      const cachedTokens = inputTokens * CACHE_HIT_RATE;
      const uncachedTokens = inputTokens * (1 - CACHE_HIT_RATE);
      effectiveInputCost =
        (cachedTokens * modelPricing.cacheRead) / MILLION +
        (uncachedTokens * modelPricing.input) / MILLION;
    }

    const outputCost = (outputTokensPerTurn * modelPricing.output) / MILLION;
    totalCost += effectiveInputCost + outputCost;
  }
  return totalCost;
}

export async function estimateTaskCost(
  taskDescription: string,
  options: Partial<EstimateOptions> = {},
): Promise<CostEstimate> {
  const model = options.model ?? "sonnet";
  const cwd = options.cwd ?? process.cwd();
  const pricing = resolveModelPricing(model);

  // Calculate context overhead
  const overhead = estimateContextOverhead();

  // Count file tokens
  let fileTokens = 0;
  let fileList = options.files ?? [];

  if (fileList.length === 0) {
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
  const contextPerTurn = overhead.totalOverhead + fileTokens;

  const lowCost = estimateCostForTurns(profile.turns.low, pricing, contextPerTurn, profile.outputTokensPerTurn);
  const expectedCost = estimateCostForTurns(profile.turns.expected, pricing, contextPerTurn, profile.outputTokensPerTurn);
  const highCost = estimateCostForTurns(profile.turns.high, pricing, contextPerTurn, profile.outputTokensPerTurn);

  // Estimate total tokens for expected case
  const expectedInputTokens = contextPerTurn * profile.turns.expected;
  const expectedOutputTokens = profile.outputTokensPerTurn * profile.turns.expected;
  const expectedCachedTokens = expectedInputTokens * CACHE_HIT_RATE;

  // Window usage — based on typical costs per model
  const typicalWindowCost = TYPICAL_WINDOW_COSTS[model] ?? TYPICAL_WINDOW_COSTS.sonnet;
  const percentOfWindow = Math.min(100, Math.round((expectedCost / typicalWindowCost) * 100));

  // Recommendations
  const recommendations: string[] = [];
  if (model !== "sonnet") {
    const sonnetPricing = resolveModelPricing("sonnet");
    const sonnetExpected = estimateCostForTurns(profile.turns.expected, sonnetPricing, contextPerTurn, profile.outputTokensPerTurn);
    const savings = expectedCost - sonnetExpected;
    if (savings > 0.01) {
      recommendations.push(
        `Consider Sonnet to save ~${formatCost(savings)} (${(expectedCost / sonnetExpected).toFixed(1)}x cheaper)`,
      );
    }
  }

  if (model === "sonnet") {
    const opusPricing = resolveModelPricing("opus");
    const opusExpected = estimateCostForTurns(profile.turns.expected, opusPricing, contextPerTurn, profile.outputTokensPerTurn);
    recommendations.push(`Using Opus would cost ~${formatCost(opusExpected)} (${(opusExpected / expectedCost).toFixed(1)}x more)`);
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
    percentOfWindow,
    recommendations,
  };
}
