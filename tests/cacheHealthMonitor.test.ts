import { describe, it, expect } from "vitest";
import { analyzeCacheHealth } from "../src/core/cacheHealthMonitor.js";
import type { ParsedMessage } from "../src/types/jsonl.js";
import type { TurnCacheMetrics, CacheHealthReport } from "../src/core/cacheHealthMonitor.js";

function makeMessage(
  turnIndex: number,
  overrides: Partial<ParsedMessage> & { usage?: Partial<ParsedMessage["usage"]> } = {},
): ParsedMessage {
  const baseUsage = {
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_input_tokens: 8000,
    cache_creation_input_tokens: 1000,
  };
  return {
    id: `msg_${turnIndex}`,
    sessionId: "test-session",
    model: "claude-sonnet-4-20250514",
    timestamp: `2026-04-04T10:${String(turnIndex).padStart(2, "0")}:00Z`,
    usage: { ...baseUsage, ...overrides.usage },
    totalCostUsd: null,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([k]) => k !== "usage"),
    ),
  } as ParsedMessage;
}

// Helper: creates a healthy session (high cache read ratio after cold starts)
function makeHealthySession(turns: number = 8): ParsedMessage[] {
  return Array.from({ length: turns }, (_, i) => {
    if (i < 2) {
      // Cold start: cache creation heavy, no reads
      return makeMessage(i, {
        usage: {
          input_tokens: 5000,
          output_tokens: 500,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 5000,
        },
      });
    }
    // Mature turns: high cache read
    return makeMessage(i, {
      usage: {
        input_tokens: 500,
        output_tokens: 500,
        cache_read_input_tokens: 9000,
        cache_creation_input_tokens: 500,
      },
    });
  });
}

// Helper: creates a broken session (very low cache read ratio)
function makeBrokenSession(turns: number = 8): ParsedMessage[] {
  return Array.from({ length: turns }, (_, i) =>
    makeMessage(i, {
      usage: {
        input_tokens: 9000,
        output_tokens: 500,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 800,
      },
    }),
  );
}

// Helper: creates a degraded session (moderate cache read ratio)
function makeDegradedSession(turns: number = 8): ParsedMessage[] {
  return Array.from({ length: turns }, (_, i) => {
    if (i < 2) {
      return makeMessage(i, {
        usage: {
          input_tokens: 5000,
          output_tokens: 500,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 5000,
        },
      });
    }
    // ~50% cache read ratio
    return makeMessage(i, {
      usage: {
        input_tokens: 3000,
        output_tokens: 500,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 2000,
      },
    });
  });
}

describe("analyzeCacheHealth", () => {
  it("returns unknown status for fewer than 3 messages", () => {
    const messages = [makeMessage(0), makeMessage(1)];
    const report = analyzeCacheHealth(messages);
    expect(report.status).toBe("unknown");
    expect(report.turnsAnalyzed).toBe(2);
    expect(report.alert).toBeNull();
    expect(report.recommendation).toBeNull();
    expect(report.estimatedWaste).toBe(0);
  });

  it("reports healthy status for high cache hit rate sessions", () => {
    const messages = makeHealthySession(8);
    const report = analyzeCacheHealth(messages);
    expect(report.status).toBe("healthy");
    expect(report.currentHitRate).toBeGreaterThanOrEqual(0.7);
    expect(report.alert).toBeNull();
    expect(report.recommendation).toBeNull();
    expect(report.turnsAnalyzed).toBe(6); // 8 - 2 cold starts
  });

  it("reports broken status for very low cache hit rate sessions", () => {
    const messages = makeBrokenSession(8);
    const report = analyzeCacheHealth(messages);
    expect(report.status).toBe("broken");
    expect(report.currentHitRate).toBeLessThan(0.4);
    expect(report.alert).not.toBeNull();
    expect(report.alert).toContain("broken");
    expect(report.recommendation).toContain("March 2026 cache bug");
  });

  it("reports degraded status for moderate cache hit rate sessions", () => {
    const messages = makeDegradedSession(8);
    const report = analyzeCacheHealth(messages);
    expect(report.status).toBe("degraded");
    expect(report.currentHitRate).toBeGreaterThanOrEqual(0.4);
    expect(report.currentHitRate).toBeLessThan(0.7);
    expect(report.alert).not.toBeNull();
    expect(report.recommendation).not.toBeNull();
  });

  it("detects sudden degradation in recent turns", () => {
    // Start healthy, then last 5 turns degrade
    const messages: ParsedMessage[] = [];
    // 2 cold starts
    for (let i = 0; i < 2; i++) {
      messages.push(
        makeMessage(i, {
          usage: {
            input_tokens: 5000,
            output_tokens: 500,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 5000,
          },
        }),
      );
    }
    // 5 healthy mature turns
    for (let i = 2; i < 7; i++) {
      messages.push(
        makeMessage(i, {
          usage: {
            input_tokens: 500,
            output_tokens: 500,
            cache_read_input_tokens: 9000,
            cache_creation_input_tokens: 500,
          },
        }),
      );
    }
    // 5 degraded turns (low cache, but average may still be ok)
    for (let i = 7; i < 12; i++) {
      messages.push(
        makeMessage(i, {
          usage: {
            input_tokens: 6000,
            output_tokens: 500,
            cache_read_input_tokens: 1000,
            cache_creation_input_tokens: 3000,
          },
        }),
      );
    }

    const report = analyzeCacheHealth(messages);
    expect(report.status).toBe("degraded");
    expect(report.alert).toContain("degradation detected");
    expect(report.recommendation).toContain("new session");
  });

  it("calculates estimatedWaste > 0 for broken sessions", () => {
    const messages = makeBrokenSession(8);
    const report = analyzeCacheHealth(messages);
    expect(report.estimatedWaste).toBeGreaterThan(0);
  });

  it("calculates estimatedWaste near 0 for healthy sessions", () => {
    const messages = makeHealthySession(8);
    const report = analyzeCacheHealth(messages);
    // Healthy sessions should have minimal waste
    expect(report.estimatedWaste).toBeLessThan(0.01);
  });

  it("computes correct per-turn metrics", () => {
    const msg = makeMessage(3, {
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 8000,
        cache_creation_input_tokens: 1000,
      },
    });
    const messages = [makeMessage(0), makeMessage(1), makeMessage(2), msg];
    const report = analyzeCacheHealth(messages);

    const turn4 = report.turnMetrics[3];
    expect(turn4.turnNumber).toBe(4);
    expect(turn4.messageId).toBe("msg_3");
    expect(turn4.inputTokens).toBe(1000);
    expect(turn4.outputTokens).toBe(500);
    expect(turn4.cacheReadTokens).toBe(8000);
    expect(turn4.cacheCreationTokens).toBe(1000);

    // cacheReadRatio = 8000 / (1000 + 8000 + 1000) = 0.8
    expect(turn4.cacheReadRatio).toBeCloseTo(0.8, 2);

    // costUncached should be > costCached since cache reads are cheaper
    expect(turn4.costUncached).toBeGreaterThan(turn4.costCached);
    expect(turn4.cacheSavings).toBeGreaterThan(0);
  });

  it("includes expectedHitRate of 0.85 in report", () => {
    const messages = makeHealthySession(5);
    const report = analyzeCacheHealth(messages);
    expect(report.expectedHitRate).toBe(0.85);
  });
});
