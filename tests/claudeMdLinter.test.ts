import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lintClaudeMd } from "../src/audit/claudeMdLinter.js";

function createTempClaudeMd(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "kerf-lint-"));
  const filePath = join(dir, "CLAUDE.md");
  writeFileSync(filePath, content);
  return filePath;
}

describe("lintClaudeMd", () => {
  it("returns null when no CLAUDE.md found", () => {
    const result = lintClaudeMd("/nonexistent/path/CLAUDE.md");
    expect(result).toBeNull();
  });

  it("parses sections and counts tokens", () => {
    const path = createTempClaudeMd(`# Title

## Section One
Some content here.

## Section Two
More content here.
`);
    const result = lintClaudeMd(path);
    expect(result).not.toBeNull();
    expect(result!.sections.length).toBeGreaterThanOrEqual(2);
    expect(result!.totalTokens).toBeGreaterThan(0);
  });

  it("detects critical rules in dead zone", () => {
    // Create a file where critical rules land in the 30-70% middle
    const lines = [
      "# Project",
      "## Intro",
      ...Array(10).fill("Normal content line."),
      "## Middle Section",
      "NEVER do this thing.",
      "ALWAYS check that thing.",
      "MUST follow this convention.",
      ...Array(10).fill("More content."),
      "## End",
      ...Array(5).fill("End content."),
    ];
    const path = createTempClaudeMd(lines.join("\n"));
    const result = lintClaudeMd(path);
    expect(result).not.toBeNull();
    expect(result!.criticalRulesInDeadZone).toBeGreaterThan(0);
  });

  it("flags files over 200 lines", () => {
    const lines = Array(250).fill("Line of content.");
    lines[0] = "# Title";
    const path = createTempClaudeMd(lines.join("\n"));
    const result = lintClaudeMd(path);
    expect(result!.isOverLineLimit).toBe(true);
  });

  it("does not flag files under 200 lines", () => {
    const lines = Array(50).fill("Line of content.");
    lines[0] = "# Title";
    const path = createTempClaudeMd(lines.join("\n"));
    const result = lintClaudeMd(path);
    expect(result!.isOverLineLimit).toBe(false);
  });

  it("suggests reorder with critical sections first", () => {
    const content = `# Title

## Normal Section
Just regular stuff.

## Critical Rules
NEVER commit to main.
ALWAYS run tests.

## Another Normal
More stuff.
`;
    const path = createTempClaudeMd(content);
    const result = lintClaudeMd(path);
    expect(result!.suggestedReorder[0]).toBe("Critical Rules");
  });

  it("handles empty CLAUDE.md", () => {
    const path = createTempClaudeMd("");
    const result = lintClaudeMd(path);
    expect(result).not.toBeNull();
    expect(result!.totalTokens).toBe(0);
    expect(result!.totalLines).toBe(1); // empty string splits to [""]
  });

  it("handles CLAUDE.md with no ## headers", () => {
    const path = createTempClaudeMd("Just some text\nwithout any headers.\n");
    const result = lintClaudeMd(path);
    expect(result).not.toBeNull();
    expect(result!.sections.length).toBe(1);
    expect(result!.sections[0].title).toBe("Preamble");
  });
});
