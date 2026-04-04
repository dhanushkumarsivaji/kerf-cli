import { estimateContextOverhead, analyzeMcpServers } from "../core/tokenCounter.js";
import { CONTEXT_WINDOW_SIZE } from "../core/config.js";
import type { ContextOverhead, McpServerInfo } from "../types/config.js";

export type ContextGrade = "A" | "B" | "C" | "D";

export interface GhostTokenReport {
  grade: ContextGrade;
  overhead: ContextOverhead;
  mcpServers: McpServerInfo[];
  percentUsable: number;
  breakdown: Array<{ label: string; tokens: number; percent: number }>;
}

export function calculateGrade(percentUsable: number): ContextGrade {
  if (percentUsable >= 70) return "A";
  if (percentUsable >= 50) return "B";
  if (percentUsable >= 30) return "C";
  return "D";
}

export function analyzeGhostTokens(claudeMdPath?: string): GhostTokenReport {
  const overhead = estimateContextOverhead(claudeMdPath);
  const mcpServers = analyzeMcpServers();
  const grade = calculateGrade(overhead.percentUsable);

  const breakdown = [
    { label: "System prompt", tokens: overhead.systemPrompt, percent: (overhead.systemPrompt / CONTEXT_WINDOW_SIZE) * 100 },
    { label: "Built-in tools", tokens: overhead.builtInTools, percent: (overhead.builtInTools / CONTEXT_WINDOW_SIZE) * 100 },
    { label: `MCP tools (${mcpServers.length} srv)`, tokens: overhead.mcpTools, percent: (overhead.mcpTools / CONTEXT_WINDOW_SIZE) * 100 },
    { label: "CLAUDE.md", tokens: overhead.claudeMd, percent: (overhead.claudeMd / CONTEXT_WINDOW_SIZE) * 100 },
    { label: "Autocompact buffer", tokens: overhead.autocompactBuffer, percent: (overhead.autocompactBuffer / CONTEXT_WINDOW_SIZE) * 100 },
  ];

  return {
    grade,
    overhead,
    mcpServers,
    percentUsable: overhead.percentUsable,
    breakdown,
  };
}
