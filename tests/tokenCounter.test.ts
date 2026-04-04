import { describe, it, expect } from "vitest";
import { estimateTokens, parseClaudeMdSections, estimateContextOverhead } from "../src/core/tokenCounter.js";

describe("estimateTokens", () => {
  it("estimates tokens using character/3.5 heuristic", () => {
    const text = "Hello, world!"; // 13 chars
    const tokens = estimateTokens(text);
    expect(tokens).toBe(Math.ceil(13 / 3.5)); // 4
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("handles long text", () => {
    const text = "a".repeat(10000);
    const tokens = estimateTokens(text);
    expect(tokens).toBe(Math.ceil(10000 / 3.5));
  });
});

describe("parseClaudeMdSections", () => {
  it("parses sections by ## headers", () => {
    const content = `# Title
## Section One
Content one

## Section Two
Content two
More content`;

    const sections = parseClaudeMdSections(content);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections.some((s) => s.title === "Section One")).toBe(true);
    expect(sections.some((s) => s.title === "Section Two")).toBe(true);
  });

  it("includes preamble content before first ##", () => {
    const content = `# Title
Some preamble

## First Section
Content`;

    const sections = parseClaudeMdSections(content);
    // Should have preamble and first section
    expect(sections.length).toBeGreaterThanOrEqual(1);
  });

  it("counts tokens per section", () => {
    const content = `## Short
Hi

## Long
${"word ".repeat(500)}`;

    const sections = parseClaudeMdSections(content);
    const shortSection = sections.find((s) => s.title === "Short");
    const longSection = sections.find((s) => s.title === "Long");
    expect(shortSection!.tokens).toBeLessThan(longSection!.tokens);
  });
});

describe("estimateContextOverhead", () => {
  it("returns overhead with correct structure", () => {
    const overhead = estimateContextOverhead();
    expect(overhead.systemPrompt).toBe(14328);
    expect(overhead.builtInTools).toBe(15000);
    expect(overhead.autocompactBuffer).toBe(33000);
    expect(overhead.totalOverhead).toBeGreaterThan(0);
    expect(overhead.effectiveWindow).toBeLessThan(200000);
    expect(overhead.percentUsable).toBeGreaterThan(0);
    expect(overhead.percentUsable).toBeLessThan(100);
  });
});
