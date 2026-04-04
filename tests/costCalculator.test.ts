import { describe, it, expect } from "vitest";
import {
  calculateMessageCost,
  resolveModelPricing,
  formatCost,
  formatTokens,
  MODEL_PRICING,
} from "../src/core/costCalculator.js";
import type { ParsedMessage } from "../src/types/jsonl.js";

function makeMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    id: "test_msg",
    model: "claude-sonnet-4-20250514",
    timestamp: "2026-04-04T10:00:00Z",
    usage: {
      input_tokens: 10000,
      output_tokens: 1000,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 500,
    },
    totalCostUsd: null,
    ...overrides,
  };
}

describe("resolveModelPricing", () => {
  it("resolves exact model names", () => {
    const pricing = resolveModelPricing("claude-sonnet-4-20250514");
    expect(pricing.input).toBe(3);
    expect(pricing.output).toBe(15);
  });

  it("resolves aliases", () => {
    const pricing = resolveModelPricing("sonnet");
    expect(pricing.input).toBe(3);
  });

  it("defaults to sonnet for unknown models", () => {
    const pricing = resolveModelPricing("unknown-model");
    expect(pricing.input).toBe(3);
  });
});

describe("calculateMessageCost", () => {
  it("calculates cost correctly for sonnet", () => {
    const msg = makeMessage();
    const cost = calculateMessageCost(msg);

    // input: 10000 * 3 / 1M = 0.03
    // output: 1000 * 15 / 1M = 0.015
    // cache_read: 5000 * 0.3 / 1M = 0.0015
    // cache_creation: 500 * 3.75 / 1M = 0.001875
    expect(cost.inputCost).toBeCloseTo(0.03, 6);
    expect(cost.outputCost).toBeCloseTo(0.015, 6);
    expect(cost.cacheReadCost).toBeCloseTo(0.0015, 6);
    expect(cost.cacheCreationCost).toBeCloseTo(0.001875, 6);
    expect(cost.totalCost).toBeCloseTo(0.048375, 6);
  });

  it("uses authoritative total_cost_usd when present", () => {
    const msg = makeMessage({ totalCostUsd: 0.50 });
    const cost = calculateMessageCost(msg);
    expect(cost.totalCost).toBe(0.50);
  });

  it("calculates opus pricing correctly", () => {
    const msg = makeMessage({ model: "claude-opus-4-20250514" });
    const cost = calculateMessageCost(msg);
    // input: 10000 * 15 / 1M = 0.15
    // output: 1000 * 75 / 1M = 0.075
    expect(cost.inputCost).toBeCloseTo(0.15, 6);
    expect(cost.outputCost).toBeCloseTo(0.075, 6);
  });

  it("calculates haiku pricing correctly", () => {
    const msg = makeMessage({ model: "claude-haiku-4-20250514" });
    const cost = calculateMessageCost(msg);
    // input: 10000 * 0.8 / 1M = 0.008
    expect(cost.inputCost).toBeCloseTo(0.008, 6);
  });
});

describe("formatCost", () => {
  it("formats with dollar sign and 2 decimals", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(0.001)).toBe("$0.00");
    expect(formatCost(100)).toBe("$100.00");
  });
});

describe("formatTokens", () => {
  it("formats millions", () => {
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });

  it("formats thousands", () => {
    expect(formatTokens(15_000)).toBe("15.0K");
  });

  it("formats small numbers as-is", () => {
    expect(formatTokens(500)).toBe("500");
  });
});
