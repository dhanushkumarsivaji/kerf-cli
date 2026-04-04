import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { estimateTokens, parseClaudeMdSections } from "../core/tokenCounter.js";
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

export function lintClaudeMd(filePath?: string): ClaudeMdAnalysis | null {
  const paths = filePath
    ? [filePath]
    : [
        join(process.cwd(), "CLAUDE.md"),
        join(process.cwd(), ".claude", "CLAUDE.md"),
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
