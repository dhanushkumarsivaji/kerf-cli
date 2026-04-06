import { describe, it, expect } from "vitest";
import {
  detectAnomalies,
  calculateCacheRatio,
} from "../src/core/anomalyDetector.js";
import type { ParsedMessage } from "../src/types/jsonl.js";

function makeMessage(
  overrides: Partial<ParsedMessage> & { id?: string } = {},
  usageOverrides: Partial<ParsedMessage["usage"]> = {},
): ParsedMessage {
  return {
    id: "msg_01",
    sessionId: "sess_01",
    model: "claude-sonnet-4-20250514",
    timestamp: "2026-04-04T10:00:00Z",
    usage: {
      input_tokens: 5000,
      output_tokens: 2000,
      cache_read_input_tokens: 3000,
      cache_creation_input_tokens: 500,
      ...usageOverrides,
    },
    totalCostUsd: null,
    ...overrides,
  };
}

function makeSession(count: number, perMsg?: Partial<ParsedMessage["usage"]>): ParsedMessage[] {
  return Array.from({ length: count }, (_, i) =>
    makeMessage({ id: `msg_${String(i + 1).padStart(2, "0")}` }, perMsg),
  );
}

describe("calculateCacheRatio", () => {
  it("returns cache_read / total input tokens", () => {
    const msg = makeMessage({}, {
      input_tokens: 1000,
      cache_read_input_tokens: 7000,
      cache_creation_input_tokens: 2000,
    });
    // 7000 / (7000 + 2000 + 1000) = 0.7
    expect(calculateCacheRatio(msg)).toBeCloseTo(0.7, 4);
  });

  it("returns 0 when all token counts are zero", () => {
    const msg = makeMessage({}, {
      input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    expect(calculateCacheRatio(msg)).toBe(0);
  });
});

describe("detectAnomalies", () => {
  it("returns normal health for a clean session", () => {
    const msgs = makeSession(6);
    const report = detectAnomalies(msgs);
    expect(report.sessionHealth).toBe("normal");
    expect(report.anomalies).toHaveLength(0);
  });

  it("detects cost spike (warning at >3x, critical at >5x)", () => {
    // Build 5 normal messages then one expensive one
    const msgs = makeSession(5);
    // Add an expensive turn: 10x the output tokens
    msgs.push(
      makeMessage(
        { id: "msg_spike" },
        { output_tokens: 100_000 },
      ),
    );
    const report = detectAnomalies(msgs);
    const spikes = report.anomalies.filter((a) => a.type === "cost_spike");
    expect(spikes.length).toBeGreaterThanOrEqual(1);
    // The spike message also triggers thinking_bloat, but we only check cost_spike here
    expect(spikes[0].messageId).toBe("msg_spike");
  });

  it("detects cache drop between consecutive turns", () => {
    // Need 3+ substantive messages for anomaly detection to run
    const msgs = makeSession(4, {
      input_tokens: 2000,
      cache_read_input_tokens: 8000,
      cache_creation_input_tokens: 1000,
    });
    // Last message: cache drops to <20%
    msgs.push(makeMessage(
      { id: "msg_drop" },
      {
        input_tokens: 9000,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 500,
      },
    ));
    const report = detectAnomalies(msgs);
    const drops = report.anomalies.filter((a) => a.type === "cache_drop");
    expect(drops).toHaveLength(1);
    expect(drops[0].severity).toBe("critical");
  });

  it("detects input explosion (>2.5x session average)", () => {
    const msgs = makeSession(5, { input_tokens: 5000 });
    // Add turn with massive input
    msgs.push(
      makeMessage(
        { id: "msg_big_input" },
        { input_tokens: 50_000 },
      ),
    );
    const report = detectAnomalies(msgs);
    const explosions = report.anomalies.filter((a) => a.type === "input_explosion");
    expect(explosions.length).toBeGreaterThanOrEqual(1);
    expect(explosions[0].messageId).toBe("msg_big_input");
    expect(explosions[0].severity).toBe("warning");
  });

  it("detects thinking bloat (output >30K)", () => {
    const msgs = makeSession(3);
    msgs.push(
      makeMessage(
        { id: "msg_thinker" },
        { output_tokens: 35_000 },
      ),
    );
    const report = detectAnomalies(msgs);
    const bloats = report.anomalies.filter((a) => a.type === "thinking_bloat");
    expect(bloats.length).toBeGreaterThanOrEqual(1);
    expect(bloats[0].metric).toBe(35_000);
  });

  it("detects resume bloat (first turn >50K output)", () => {
    const msgs = [
      makeMessage(
        { id: "msg_resume" },
        { output_tokens: 60_000 },
      ),
      ...makeSession(3),
    ];
    const report = detectAnomalies(msgs);
    const resumes = report.anomalies.filter((a) => a.type === "resume_bloat");
    expect(resumes).toHaveLength(1);
    expect(resumes[0].severity).toBe("critical");
    expect(resumes[0].turnNumber).toBe(1);
  });

  it("classifies session health as critical with >=2 critical anomalies", () => {
    // First turn: resume bloat (critical) + high cache
    const msgs = [
      makeMessage({ id: "msg_01" }, {
        output_tokens: 60_000,
        input_tokens: 2000,
        cache_read_input_tokens: 8000,
        cache_creation_input_tokens: 1000,
      }),
      ...makeSession(3, {
        input_tokens: 2000,
        cache_read_input_tokens: 8000,
        cache_creation_input_tokens: 1000,
      }),
      // Cache drop turn (critical)
      makeMessage({ id: "msg_drop" }, {
        input_tokens: 9000,
        cache_read_input_tokens: 500,
        cache_creation_input_tokens: 500,
      }),
    ];
    const report = detectAnomalies(msgs);
    const criticals = report.anomalies.filter((a) => a.severity === "critical");
    expect(criticals.length).toBeGreaterThanOrEqual(2);
    expect(report.sessionHealth).toBe("critical");
  });

  it("returns empty anomalies for empty input", () => {
    const report = detectAnomalies([]);
    expect(report.anomalies).toHaveLength(0);
    expect(report.sessionHealth).toBe("normal");
  });
});
