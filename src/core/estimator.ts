import { glob } from "glob";
import { countFileTokens, countFileTokensAccurate, estimateContextOverhead } from "./tokenCounter.js";
import { resolveModelPricing, formatCost } from "./costCalculator.js";
import type { CostEstimate, EstimateOptions, ComplexitySignals } from "../types/config.js";
import type { ModelPricing } from "../types/pricing.js";

const SIMPLE_KEYWORDS = [
  "typo", "rename", "fix typo", "update version", "change name",
  "remove unused", "delete", "bump", "update readme", "fix lint",
  "add comment", "fix import", "remove import",
];
const COMPLEX_KEYWORDS = [
  "refactor", "rewrite", "new module", "implement", "build", "create",
  "migrate", "redesign", "overhaul", "architecture", "dashboard",
  "full stack", "fullstack", "from scratch", "new app", "web app",
  "entire", "complete", "system", "framework", "engine", "pipeline",
  "authentication", "auth system", "database", "schema", "api",
  "test suite", "ci/cd", "deployment", "integration",
];

const TYPICAL_WINDOW_COSTS: Record<string, number> = {
  sonnet: 15,
  opus: 75,
  haiku: 4,
};

const TOOL_CALLS_PER_COMPLEXITY: Record<string, number> = {
  trivial: 1,
  simple: 2,
  moderate: 3,
  complex: 4,
  massive: 5,
};

const TOKENS_PER_TOOL_CALL = 800;
const MILLION = 1_000_000;
const CACHE_HIT_RATE = 0.9;

function detectKeywordScore(task: string): number {
  const lower = task.toLowerCase();
  if (SIMPLE_KEYWORDS.some((k) => lower.includes(k))) return 0.2;
  if (COMPLEX_KEYWORDS.some((k) => lower.includes(k))) return 0.9;
  return 0.5;
}

export function scoreComplexity(
  task: string,
  fileTokens: number,
  fileCount: number,
): ComplexitySignals {
  const keywordScore = detectKeywordScore(task);

  // File size: <1K trivial, 1-5K small, 5-20K medium, 20-100K large, >100K massive
  const fileSizeScore = Math.min(1, fileTokens / 50000);

  // File count: 1=simple, 2-5=medium, 5-15=complex, >15=massive
  const fileCountScore = Math.min(1, fileCount / 15);

  // Description length: longer = more complex
  const wordCount = task.split(/\s+/).filter(Boolean).length;
  const descriptionLengthScore = Math.min(1, wordCount / 15);

  // Weighted average — keywords dominate when files aren't specified
  const hasFiles = fileTokens > 0 || fileCount > 0;
  const totalScore = hasFiles
    ? keywordScore * 0.35 + fileSizeScore * 0.30 + fileCountScore * 0.20 + descriptionLengthScore * 0.15
    : keywordScore * 0.60 + descriptionLengthScore * 0.40;

  return { keywordScore, fileSizeScore, fileCountScore, descriptionLengthScore, totalScore };
}

function scoreToComplexityLabel(score: number): string {
  if (score < 0.15) return "trivial";
  if (score < 0.35) return "simple";
  if (score < 0.55) return "moderate";
  if (score < 0.75) return "complex";
  return "massive";
}

function scoreTurnRange(score: number): { low: number; expected: number; high: number } {
  const baseTurns = Math.round(2 + score * 48);
  return {
    low: Math.max(2, Math.round(baseTurns * 0.5)),
    expected: baseTurns,
    high: Math.round(baseTurns * 1.6),
  };
}

function outputTokensPerTurn(fileTokens: number): number {
  if (fileTokens < 5000) return 1500;
  if (fileTokens < 20000) return 2000;
  return 3000;
}

function estimateCostForTurns(
  turns: number,
  modelPricing: ModelPricing,
  contextPerTurn: number,
  tokensPerTurn: number,
  toolCallsPerTurn: number,
): number {
  let totalCost = 0;
  for (let turn = 1; turn <= turns; turn++) {
    const conversationGrowth = (turn - 1) * tokensPerTurn;
    const toolOverhead = toolCallsPerTurn * TOKENS_PER_TOOL_CALL;
    const inputTokens = contextPerTurn + conversationGrowth + toolOverhead;

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

    const outputCost = (tokensPerTurn * modelPricing.output) / MILLION;
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

  const overhead = estimateContextOverhead();

  // Collect files and count tokens
  let fileTokens = 0;
  let fileCount = 0;
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
      // No git
    }
  }

  const usePrecise = options.precise === true;
  for (const filePattern of fileList) {
    const matched = await glob(filePattern, { cwd, absolute: true });
    for (const f of matched) {
      const tokens = usePrecise ? await countFileTokensAccurate(f) : countFileTokens(f);
      if (tokens > 0) {
        fileTokens += tokens;
        fileCount++;
      }
    }
  }

  // Score complexity
  const signals = scoreComplexity(taskDescription, fileTokens, fileCount);
  const complexityLabel = scoreToComplexityLabel(signals.totalScore);
  const turns = scoreTurnRange(signals.totalScore);
  const tokensPerTurn = outputTokensPerTurn(fileTokens);
  const toolCallsPerTurn = TOOL_CALLS_PER_COMPLEXITY[complexityLabel] ?? 3;

  const contextPerTurn = overhead.totalOverhead + fileTokens;

  const lowCost = estimateCostForTurns(turns.low, pricing, contextPerTurn, tokensPerTurn, toolCallsPerTurn);
  const expectedCost = estimateCostForTurns(turns.expected, pricing, contextPerTurn, tokensPerTurn, toolCallsPerTurn);
  const highCost = estimateCostForTurns(turns.high, pricing, contextPerTurn, tokensPerTurn, toolCallsPerTurn);

  const expectedInputTokens = contextPerTurn * turns.expected;
  const expectedOutputTokens = tokensPerTurn * turns.expected;
  const expectedCachedTokens = expectedInputTokens * CACHE_HIT_RATE;
  const totalToolOverhead = toolCallsPerTurn * TOKENS_PER_TOOL_CALL * turns.expected;

  const typicalWindowCost = TYPICAL_WINDOW_COSTS[model] ?? TYPICAL_WINDOW_COSTS.sonnet;
  const percentOfWindow = Math.min(100, Math.round((expectedCost / typicalWindowCost) * 100));

  // Recommendations
  const recommendations: string[] = [];
  if (model !== "sonnet") {
    const sonnetPricing = resolveModelPricing("sonnet");
    const sonnetExpected = estimateCostForTurns(turns.expected, sonnetPricing, contextPerTurn, tokensPerTurn, toolCallsPerTurn);
    const savings = expectedCost - sonnetExpected;
    if (savings > 0.01) {
      recommendations.push(
        `Consider Sonnet to save ~${formatCost(savings)} (${(expectedCost / sonnetExpected).toFixed(1)}x cheaper)`,
      );
    }
  }

  if (model === "sonnet") {
    const opusPricing = resolveModelPricing("opus");
    const opusExpected = estimateCostForTurns(turns.expected, opusPricing, contextPerTurn, tokensPerTurn, toolCallsPerTurn);
    recommendations.push(`Using Opus would cost ~${formatCost(opusExpected)} (${(opusExpected / expectedCost).toFixed(1)}x more)`);
  }

  if (overhead.percentUsable < 60) {
    recommendations.push(`High ghost token overhead (${(100 - overhead.percentUsable).toFixed(0)}%). Run 'kerf audit' to optimize.`);
  }

  if (fileTokens > 50000) {
    recommendations.push(`Large file context (${(fileTokens / 1000).toFixed(0)}K tokens). Consider narrowing scope.`);
  }

  return {
    model,
    estimatedTurns: turns,
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
    fileCount,
    percentOfWindow,
    recommendations,
    complexitySignals: signals,
    detectedComplexity: complexityLabel,
    estimatedToolOverhead: totalToolOverhead,
    tokenCountingMethod: usePrecise && process.env.ANTHROPIC_API_KEY ? "precise" : "heuristic",
  };
}
