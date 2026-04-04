import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek.js";
import { BILLING_WINDOW_HOURS } from "./config.js";
import type { ParsedMessage, ParsedSession } from "../types/jsonl.js";
import type {
  ModelPricing,
  PricingConfig,
  CostBreakdown,
  SessionCostSummary,
  CostVelocity,
  AggregationPeriod,
  AggregatedCost,
} from "../types/pricing.js";

dayjs.extend(isoWeek);

export const MODEL_PRICING: PricingConfig = {
  "claude-sonnet-4-20250514": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheCreation: 3.75,
  },
  "claude-opus-4-20250514": {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheCreation: 18.75,
  },
  "claude-haiku-4-20250514": {
    input: 0.8,
    output: 4,
    cacheRead: 0.08,
    cacheCreation: 1.0,
  },
};

// Alias mappings for short model names
const MODEL_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-20250514",
  haiku: "claude-haiku-4-20250514",
};

export function resolveModelPricing(model: string): ModelPricing {
  const resolved = MODEL_ALIASES[model] ?? model;
  // Try exact match first, then prefix match
  if (MODEL_PRICING[resolved]) return MODEL_PRICING[resolved];
  const match = Object.keys(MODEL_PRICING).find((k) => resolved.startsWith(k) || k.startsWith(resolved));
  if (match) return MODEL_PRICING[match];
  // Default to sonnet pricing
  return MODEL_PRICING["claude-sonnet-4-20250514"];
}

export function calculateMessageCost(msg: ParsedMessage): CostBreakdown {
  // If authoritative cost is present, use it
  if (msg.totalCostUsd !== null && msg.totalCostUsd > 0) {
    return {
      inputCost: 0,
      outputCost: 0,
      cacheReadCost: 0,
      cacheCreationCost: 0,
      totalCost: msg.totalCostUsd,
    };
  }

  const pricing = resolveModelPricing(msg.model);
  const MILLION = 1_000_000;

  // Use multiply-then-divide to avoid floating point issues
  const inputCost = (msg.usage.input_tokens * pricing.input) / MILLION;
  const outputCost = (msg.usage.output_tokens * pricing.output) / MILLION;
  const cacheReadCost = (msg.usage.cache_read_input_tokens * pricing.cacheRead) / MILLION;
  const cacheCreationCost = (msg.usage.cache_creation_input_tokens * pricing.cacheCreation) / MILLION;

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheCreationCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheCreationCost,
  };
}

export function calculateSessionCost(session: ParsedSession): SessionCostSummary {
  let totalCost = 0;
  const costBreakdown: CostBreakdown = {
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheCreationCost: 0,
    totalCost: 0,
  };

  for (const msg of session.messages) {
    const msgCost = calculateMessageCost(msg);
    costBreakdown.inputCost += msgCost.inputCost;
    costBreakdown.outputCost += msgCost.outputCost;
    costBreakdown.cacheReadCost += msgCost.cacheReadCost;
    costBreakdown.cacheCreationCost += msgCost.cacheCreationCost;
    totalCost += msgCost.totalCost;
  }

  costBreakdown.totalCost = totalCost;

  return {
    sessionId: session.sessionId,
    totalCost,
    tokenBreakdown: {
      input: session.totalInputTokens,
      output: session.totalOutputTokens,
      cacheRead: session.totalCacheReadTokens,
      cacheCreation: session.totalCacheCreationTokens,
    },
    costBreakdown,
    model: session.messages[0]?.model ?? "unknown",
    messageCount: session.messageCount,
    startTime: session.startTime,
    endTime: session.endTime,
  };
}

export function calculateCostVelocity(messages: ParsedMessage[]): CostVelocity {
  if (messages.length < 2) {
    return { dollarsPerMinute: 0, tokensPerMinute: 0, projectedWindowCost: 0, minutesRemaining: 0 };
  }

  // Use last 10 messages for velocity calculation
  const recent = messages.slice(-10);
  const firstTime = dayjs(recent[0].timestamp);
  const lastTime = dayjs(recent[recent.length - 1].timestamp);
  const durationMinutes = lastTime.diff(firstTime, "minute", true);

  if (durationMinutes <= 0) {
    return { dollarsPerMinute: 0, tokensPerMinute: 0, projectedWindowCost: 0, minutesRemaining: 0 };
  }

  let totalCost = 0;
  let totalTokens = 0;
  for (const msg of recent) {
    totalCost += calculateMessageCost(msg).totalCost;
    totalTokens += msg.usage.input_tokens + msg.usage.output_tokens;
  }

  const dollarsPerMinute = totalCost / durationMinutes;
  const tokensPerMinute = totalTokens / durationMinutes;
  const windowMinutes = BILLING_WINDOW_HOURS * 60;
  const projectedWindowCost = dollarsPerMinute * windowMinutes;

  // Time remaining in current billing window
  const windowStart = dayjs().subtract(BILLING_WINDOW_HOURS, "hour");
  const elapsed = dayjs().diff(windowStart, "minute", true);
  const minutesRemaining = Math.max(0, windowMinutes - elapsed);

  return { dollarsPerMinute, tokensPerMinute, projectedWindowCost, minutesRemaining };
}

export function aggregateCosts(
  messages: ParsedMessage[],
  period: AggregationPeriod,
): AggregatedCost[] {
  const groups = new Map<string, { messages: ParsedMessage[]; sessions: Set<string> }>();

  for (const msg of messages) {
    const key = getPeriodKey(msg.timestamp, period);
    const group = groups.get(key) ?? { messages: [], sessions: new Set() };
    group.messages.push(msg);
    group.sessions.add(msg.id.split("_")[0] ?? msg.id);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    let totalCost = 0;
    let totalInput = 0;
    let totalOutput = 0;

    for (const msg of group.messages) {
      totalCost += calculateMessageCost(msg).totalCost;
      totalInput += msg.usage.input_tokens;
      totalOutput += msg.usage.output_tokens;
    }

    return {
      period: key,
      periodLabel: formatPeriodLabel(key, period),
      totalCost,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      messageCount: group.messages.length,
      sessionCount: group.sessions.size,
    };
  });
}

function getPeriodKey(timestamp: string, period: AggregationPeriod): string {
  const d = dayjs(timestamp);
  switch (period) {
    case "hour":
      return d.format("YYYY-MM-DD-HH");
    case "day":
      return d.format("YYYY-MM-DD");
    case "billing_window":
      // 5-hour windows starting from midnight
      const hour = d.hour();
      const windowStart = Math.floor(hour / BILLING_WINDOW_HOURS) * BILLING_WINDOW_HOURS;
      return `${d.format("YYYY-MM-DD")}-W${windowStart}`;
    case "week":
      return `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, "0")}`;
    case "month":
      return d.format("YYYY-MM");
    case "session":
    default:
      return timestamp;
  }
}

function formatPeriodLabel(key: string, period: AggregationPeriod): string {
  switch (period) {
    case "hour":
      return dayjs(key, "YYYY-MM-DD-HH").format("MMM D, h A");
    case "day":
      return dayjs(key).format("ddd, MMM D");
    case "week":
      return `Week ${key.split("-W")[1]}`;
    case "month":
      return dayjs(key).format("MMMM YYYY");
    default:
      return key;
  }
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}
