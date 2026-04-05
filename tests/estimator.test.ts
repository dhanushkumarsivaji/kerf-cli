import { describe, it, expect } from "vitest";
import { estimateTaskCost, scoreComplexity } from "../src/core/estimator.js";

describe("scoreComplexity", () => {
  it("gives low score for simple keywords with no files", () => {
    const signals = scoreComplexity("fix typo", 0, 0);
    expect(signals.totalScore).toBeLessThan(0.2);
    expect(signals.keywordScore).toBe(0.2);
  });

  it("gives high score for complex keywords", () => {
    const signals = scoreComplexity("refactor the entire auth system", 0, 0);
    expect(signals.keywordScore).toBe(0.9);
    expect(signals.totalScore).toBeGreaterThan(0.3);
  });

  it("file size increases score significantly", () => {
    const noFiles = scoreComplexity("update code", 0, 0);
    const largeFiles = scoreComplexity("update code", 50000, 10);
    expect(largeFiles.totalScore).toBeGreaterThan(noFiles.totalScore + 0.2);
  });

  it("same keywords with different file sizes produce different scores", () => {
    const small = scoreComplexity("fix typo", 500, 1);
    const large = scoreComplexity("fix typo", 40000, 20);
    expect(large.totalScore).toBeGreaterThan(small.totalScore);
  });

  it("long descriptions score higher", () => {
    const short = scoreComplexity("fix bug", 0, 0);
    const long = scoreComplexity("fix the authentication bug in the login flow that causes session timeouts for users on mobile devices", 0, 0);
    expect(long.descriptionLengthScore).toBeGreaterThan(short.descriptionLengthScore);
  });
});

describe("estimateTaskCost", () => {
  it("estimates a simple task with fewer turns than complex", async () => {
    const simple = await estimateTaskCost("fix typo", { model: "sonnet" });
    const complex = await estimateTaskCost("refactor the entire authentication system from scratch", { model: "sonnet" });
    expect(simple.estimatedTurns.expected).toBeLessThan(complex.estimatedTurns.expected);
  });

  it("detects complex keywords correctly", async () => {
    const result = await estimateTaskCost("build a complete dashboard web app from scratch", { model: "sonnet", files: [], cwd: "/tmp" });
    expect(result.detectedComplexity).toMatch(/complex|massive/);
    expect(result.estimatedTurns.expected).toBeGreaterThanOrEqual(15);
  });

  it("returns cost as formatted strings", async () => {
    const result = await estimateTaskCost("fix a bug", { model: "sonnet" });
    expect(result.estimatedCost.low).toMatch(/^\$/);
    expect(result.estimatedCost.expected).toMatch(/^\$/);
    expect(result.estimatedCost.high).toMatch(/^\$/);
  });

  it("includes complexity signals", async () => {
    const result = await estimateTaskCost("build a dashboard", { model: "sonnet" });
    expect(result.complexitySignals).toBeDefined();
    expect(result.complexitySignals.totalScore).toBeGreaterThan(0);
    expect(result.detectedComplexity).toBeTruthy();
  });

  it("includes tool overhead", async () => {
    const result = await estimateTaskCost("add feature", { model: "sonnet" });
    expect(result.estimatedToolOverhead).toBeGreaterThan(0);
  });

  it("includes context overhead", async () => {
    const result = await estimateTaskCost("add feature", { model: "sonnet" });
    expect(result.contextOverhead).toBeGreaterThan(0);
  });

  it("percentOfWindow is reasonable", async () => {
    const result = await estimateTaskCost("build a complete web application from scratch", { model: "sonnet" });
    expect(result.percentOfWindow).toBeGreaterThan(0);
    expect(result.percentOfWindow).toBeLessThanOrEqual(100);
  });

  it("includes recommendations for sonnet", async () => {
    const result = await estimateTaskCost("fix a bug", { model: "sonnet" });
    expect(result.recommendations.some((r) => r.includes("Opus"))).toBe(true);
  });
});
