import { analyzeGhostTokens } from "./ghostTokens.js";
import { lintClaudeMd } from "./claudeMdLinter.js";
import { analyzeMcp } from "./mcpAnalyzer.js";
import type { AuditRecommendation, AuditResult } from "../types/config.js";

export function runFullAudit(claudeMdPath?: string): AuditResult {
  const ghostReport = analyzeGhostTokens(claudeMdPath);
  const claudeMdAnalysis = lintClaudeMd(claudeMdPath);
  const mcpAnalysis = analyzeMcp();

  const recommendations: AuditRecommendation[] = [];

  // CLAUDE.md recommendations
  if (claudeMdAnalysis) {
    if (claudeMdAnalysis.criticalRulesInDeadZone > 0) {
      recommendations.push({
        priority: "high",
        impact: "improved rule adherence",
        action: `Reorder CLAUDE.md — ${claudeMdAnalysis.criticalRulesInDeadZone} critical rule(s) in the low-attention dead zone (30-70% position). Move them to the top or bottom.`,
        category: "claude-md",
      });
    }

    if (claudeMdAnalysis.isOverLineLimit) {
      recommendations.push({
        priority: "high",
        impact: `${claudeMdAnalysis.totalLines - 200} lines over limit`,
        action: `CLAUDE.md is ${claudeMdAnalysis.totalLines} lines (limit: 200). Trim or move sections to skills.`,
        category: "claude-md",
      });
    }

    const heavySections = claudeMdAnalysis.sections.filter((s) => s.tokens > 500);
    for (const section of heavySections) {
      recommendations.push({
        priority: "medium",
        impact: `-${section.tokens} tokens/session`,
        action: `Move '${section.title}' section to a skill (${section.tokens} tokens — heavy section)`,
        category: "claude-md",
      });
    }
  }

  // MCP recommendations
  for (const server of mcpAnalysis.heavyServers) {
    recommendations.push({
      priority: "medium",
      impact: `-${server.estimatedTokens.toLocaleString()} tokens/session`,
      action: `MCP server '${server.name}' has ${server.toolCount} tools. Consider disabling if unused or enabling Tool Search.`,
      category: "mcp",
    });
  }

  if (!mcpAnalysis.hasToolSearch && mcpAnalysis.totalTools > 10) {
    recommendations.push({
      priority: "high",
      impact: `~${Math.round(mcpAnalysis.totalTokens * 0.85).toLocaleString()} tokens saved`,
      action: "Enable Tool Search (deferred tool loading) to reduce MCP overhead by ~85%.",
      category: "mcp",
    });
  }

  for (const rec of mcpAnalysis.recommendations) {
    if (rec.includes("CLI")) {
      recommendations.push({
        priority: "low",
        impact: "reduced token overhead",
        action: rec,
        category: "mcp",
      });
    }
  }

  // Ghost token recommendations
  if (ghostReport.percentUsable < 50) {
    recommendations.push({
      priority: "high",
      impact: `only ${ghostReport.percentUsable.toFixed(0)}% usable`,
      action: `Context window health is poor (grade ${ghostReport.grade}). Total overhead: ${ghostReport.overhead.totalOverhead.toLocaleString()} tokens.`,
      category: "ghost-tokens",
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    grade: ghostReport.grade,
    contextOverhead: ghostReport.overhead,
    claudeMdAnalysis,
    mcpServers: ghostReport.mcpServers,
    recommendations,
  };
}
