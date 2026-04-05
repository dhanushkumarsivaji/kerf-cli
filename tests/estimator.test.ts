import { describe, it, expect } from "vitest";
import { estimateTaskCost } from "../src/core/estimator.js";

describe("estimateTaskCost", () => {
  it("estimates a simple task with low cost", async () => {
    const result = await estimateTaskCost("fix typo in README", { model: "sonnet" });
    expect(result.model).toBe("sonnet");
    expect(result.estimatedTurns.low).toBeLessThanOrEqual(5);
    expect(result.estimatedTurns.expected).toBeLessThanOrEqual(5);
  });

  it("estimates a complex task with higher turns", async () => {
    const result = await estimateTaskCost("refactor the entire auth module", { model: "sonnet" });
    expect(result.estimatedTurns.expected).toBeGreaterThanOrEqual(15);
  });

  it("estimates a medium task", async () => {
    const result = await estimateTaskCost("fix the login form validation", { model: "sonnet" });
    expect(result.estimatedTurns.expected).toBeGreaterThanOrEqual(5);
    expect(result.estimatedTurns.expected).toBeLessThanOrEqual(15);
  });

  it("returns cost as formatted strings", async () => {
    const result = await estimateTaskCost("fix a bug", { model: "sonnet" });
    expect(result.estimatedCost.low).toMatch(/^\$/);
    expect(result.estimatedCost.expected).toMatch(/^\$/);
    expect(result.estimatedCost.high).toMatch(/^\$/);
  });

  it("includes recommendations for sonnet model", async () => {
    const result = await estimateTaskCost("fix a bug", { model: "sonnet" });
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.some((r) => r.includes("Opus"))).toBe(true);
  });

  it("includes context overhead", async () => {
    const result = await estimateTaskCost("add feature", { model: "sonnet" });
    expect(result.contextOverhead).toBeGreaterThan(0);
  });
});
