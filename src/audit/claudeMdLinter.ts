import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseClaudeMdSections, findGitRootClaudeMd } from "../core/tokenCounter.js";
import type { ClaudeMdAnalysis, ClaudeMdSection } from "../types/config.js";

const CRITICAL_RULE_PATTERN = /\b(NEVER|ALWAYS|MUST|IMPORTANT|CRITICAL)\b/i;
const SKILL_CANDIDATES = /\b(review|deploy|release|migration|template|boilerplate|scaffold)\b/i;
const LINE_LIMIT = 200;

type AttentionZone = "high-start" | "low-middle" | "high-end";

function getAttentionZone(position: number, total: number): AttentionZone {
  const pct = total > 0 ? position / total : 0;
  if (pct <= 0.3) return "high-start";
  if (pct >= 0.7) return "high-end";
  return "low-middle";
}

export function findClaudeMdPath(): string | null {
  const paths = [
    join(process.cwd(), "CLAUDE.md"),
    join(process.cwd(), ".claude", "CLAUDE.md"),
    ...findGitRootClaudeMd(),
    join(homedir(), ".claude", "CLAUDE.md"),
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function reorderClaudeMd(filePath: string): { original: string; reordered: string; changes: string[] } {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Find preamble (content before first ## header)
  let preambleEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      preambleEnd = i;
      break;
    }
  }

  const preamble = preambleEnd > 0 ? lines.slice(0, preambleEnd).join("\n") + "\n\n" : "";

  const sections = parseClaudeMdSections(content);
  // Remove preamble section if present
  const nonPreambleSections = sections.filter(s => s.title !== "Preamble");

  const CRITICAL_PATTERN = /\b(NEVER|ALWAYS|MUST|IMPORTANT|CRITICAL)\b/i;
  const critical = nonPreambleSections.filter(s => CRITICAL_PATTERN.test(s.content));
  const normal = nonPreambleSections.filter(s => !CRITICAL_PATTERN.test(s.content) && s.tokens <= 500);
  const heavy = nonPreambleSections.filter(s => !CRITICAL_PATTERN.test(s.content) && s.tokens > 500);

  const reorderedSections = [...critical, ...normal, ...heavy];
  const reordered = preamble + reorderedSections.map(s => "## " + s.title + "\n" + s.content).join("\n\n");

  const changes: string[] = [];
  if (critical.length > 0) changes.push("Moved " + critical.length + " critical-rule section(s) to top");
  if (heavy.length > 0) changes.push("Moved " + heavy.length + " heavy section(s) to bottom");

  return { original: content, reordered, changes };
}

export function lintClaudeMd(filePath?: string): ClaudeMdAnalysis | null {
  const paths = filePath
    ? [filePath]
    : [
        join(process.cwd(), "CLAUDE.md"),
        join(process.cwd(), ".claude", "CLAUDE.md"),
        ...findGitRootClaudeMd(),
        join(homedir(), ".claude", "CLAUDE.md"),
      ];

  let resolvedPath: string | null = null;
  for (const p of paths) {
    if (existsSync(p)) {
      resolvedPath = p;
      break;
    }
  }

  if (!resolvedPath) return null;

  const content = readFileSync(resolvedPath, "utf-8");
  const lines = content.split("\n");
  const totalLines = lines.length;
  const rawSections = parseClaudeMdSections(content);
  const totalTokens = rawSections.reduce((sum, s) => sum + s.tokens, 0);

  let criticalRulesInDeadZone = 0;
  const sectionsToSkill: string[] = [];

  const sections: ClaudeMdSection[] = rawSections.map((s) => {
    const midpoint = (s.lineStart + s.lineEnd) / 2;
    const attentionZone = getAttentionZone(midpoint, totalLines);
    const hasCriticalRules = CRITICAL_RULE_PATTERN.test(s.content);

    if (hasCriticalRules && attentionZone === "low-middle") {
      criticalRulesInDeadZone++;
    }

    if (SKILL_CANDIDATES.test(s.title) || SKILL_CANDIDATES.test(s.content)) {
      sectionsToSkill.push(s.title);
    }

    return {
      title: s.title,
      content: s.content,
      tokens: s.tokens,
      lineStart: s.lineStart,
      lineEnd: s.lineEnd,
      hasCriticalRules,
      attentionZone,
    };
  });

  // Generate suggested reordering: critical rules first, then normal, then verbose
  const critical = sections.filter((s) => s.hasCriticalRules);
  const normal = sections.filter((s) => !s.hasCriticalRules && s.tokens <= 500);
  const heavy = sections.filter((s) => !s.hasCriticalRules && s.tokens > 500);
  const suggestedReorder = [...critical, ...normal, ...heavy].map((s) => s.title);

  return {
    totalLines,
    totalTokens,
    sections,
    criticalRulesInDeadZone,
    isOverLineLimit: totalLines > LINE_LIMIT,
    suggestedReorder,
  };
}
