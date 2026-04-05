import { describe, it, expect } from "vitest";
import { calculateGrade, analyzeGhostTokens } from "../src/audit/ghostTokens.js";

describe("calculateGrade", () => {
  it("returns A for >70% usable", () => {
    expect(calculateGrade(75)).toBe("A");
    expect(calculateGrade(100)).toBe("A");
  });

  it("returns B for 50-70% usable", () => {
    expect(calculateGrade(60)).toBe("B");
    expect(calculateGrade(50)).toBe("B");
  });

  it("returns C for 30-50% usable", () => {
    expect(calculateGrade(40)).toBe("C");
    expect(calculateGrade(30)).toBe("C");
  });

  it("returns D for <30% usable", () => {
    expect(calculateGrade(20)).toBe("D");
    expect(calculateGrade(0)).toBe("D");
  });

  it("handles boundary values correctly", () => {
    expect(calculateGrade(70)).toBe("A");
    expect(calculateGrade(69.9)).toBe("B");
    expect(calculateGrade(49.9)).toBe("C");
    expect(calculateGrade(29.9)).toBe("D");
  });
});

describe("analyzeGhostTokens", () => {
  it("returns correct fixed overhead values", () => {
    const report = analyzeGhostTokens();
    expect(report.overhead.systemPrompt).toBe(14328);
    expect(report.overhead.builtInTools).toBe(15000);
    expect(report.overhead.autocompactBuffer).toBe(33000);
  });

  it("calculates effective window correctly", () => {
    const report = analyzeGhostTokens();
    expect(report.overhead.effectiveWindow).toBe(200000 - report.overhead.totalOverhead);
  });

  it("calculates percentUsable correctly", () => {
    const report = analyzeGhostTokens();
    const expected = (report.overhead.effectiveWindow / 200000) * 100;
    expect(report.percentUsable).toBeCloseTo(expected, 2);
  });

  it("includes breakdown items that sum to total", () => {
    const report = analyzeGhostTokens();
    const breakdownSum = report.breakdown.reduce((sum, item) => sum + item.tokens, 0);
    expect(breakdownSum).toBe(report.overhead.totalOverhead);
  });

  it("assigns a valid grade", () => {
    const report = analyzeGhostTokens();
    expect(["A", "B", "C", "D"]).toContain(report.grade);
  });

  it("breakdown percentages are correct", () => {
    const report = analyzeGhostTokens();
    for (const item of report.breakdown) {
      const expectedPct = (item.tokens / 200000) * 100;
      expect(item.percent).toBeCloseTo(expectedPct, 2);
    }
  });
});
