import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  CONTEXT_WINDOW_SIZE,
  SYSTEM_PROMPT_TOKENS,
  BUILT_IN_TOOLS_TOKENS,
  AUTOCOMPACT_BUFFER_TOKENS,
  MCP_TOKENS_PER_TOOL,
} from "./config.js";
import type { ContextOverhead, McpServerInfo } from "../types/config.js";

const SUPPORTED_EXTENSIONS = new Set([".md", ".ts", ".js", ".json", ".yaml", ".yml", ".py", ".txt"]);

/**
 * Fast local heuristic: tokens ~= characters / 3.5
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Count tokens in a file using the heuristic
 */
export function countFileTokens(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8");
    return estimateTokens(content);
  } catch {
    return 0;
  }
}

export interface ClaudeMdSection {
  title: string;
  content: string;
  tokens: number;
  lineStart: number;
  lineEnd: number;
}

/**
 * Parse CLAUDE.md into sections by ## headers
 */
export function parseClaudeMdSections(content: string): ClaudeMdSection[] {
  const lines = content.split("\n");
  const sections: ClaudeMdSection[] = [];
  let currentTitle = "Preamble";
  let currentContent: string[] = [];
  let currentLineStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      // Save previous section
      if (currentContent.length > 0 || currentTitle !== "Preamble") {
        const sectionContent = currentContent.join("\n");
        sections.push({
          title: currentTitle,
          content: sectionContent,
          tokens: estimateTokens(sectionContent),
          lineStart: currentLineStart,
          lineEnd: i,
        });
      }
      currentTitle = line.replace(/^##\s*/, "");
      currentContent = [];
      currentLineStart = i + 1;
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentContent.length > 0) {
    const sectionContent = currentContent.join("\n");
    sections.push({
      title: currentTitle,
      content: sectionContent,
      tokens: estimateTokens(sectionContent),
      lineStart: currentLineStart,
      lineEnd: lines.length,
    });
  }

  return sections;
}

/**
 * Analyze CLAUDE.md token overhead
 */
export function analyzeClaudeMd(filePath?: string): { totalTokens: number; sections: ClaudeMdSection[]; heavySections: ClaudeMdSection[] } {
  const paths = filePath
    ? [filePath]
    : [
        join(process.cwd(), "CLAUDE.md"),
        join(process.cwd(), ".claude", "CLAUDE.md"),
      ];

  for (const p of paths) {
    if (existsSync(p)) {
      const content = readFileSync(p, "utf-8");
      const sections = parseClaudeMdSections(content);
      const totalTokens = sections.reduce((sum, s) => sum + s.tokens, 0);
      const heavySections = sections.filter((s) => s.tokens > 500);
      return { totalTokens, sections, heavySections };
    }
  }

  return { totalTokens: 0, sections: [], heavySections: [] };
}

/**
 * Parse MCP server configurations and estimate token cost
 */
export function analyzeMcpServers(): McpServerInfo[] {
  const servers: McpServerInfo[] = [];
  const paths = [
    join(process.cwd(), ".mcp.json"),
    join(homedir(), ".claude.json"),
  ];

  for (const configPath of paths) {
    if (!existsSync(configPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      const mcpServers = raw.mcpServers ?? raw.mcp_servers ?? {};
      for (const [name, config] of Object.entries(mcpServers)) {
        const cfg = config as Record<string, unknown>;
        // Estimate tools: if tools array is present, use its length; otherwise default to 5
        const tools = Array.isArray(cfg.tools) ? cfg.tools : [];
        const toolCount = tools.length || 5;
        const estimatedTokens = toolCount * MCP_TOKENS_PER_TOOL;
        servers.push({
          name,
          toolCount,
          estimatedTokens,
          isHeavy: toolCount > 10,
        });
      }
    } catch {
      continue;
    }
  }

  return servers;
}

/**
 * Estimate total context overhead (ghost tokens)
 */
export function estimateContextOverhead(claudeMdPath?: string): ContextOverhead {
  const claudeMd = analyzeClaudeMd(claudeMdPath);
  const mcpServers = analyzeMcpServers();
  const mcpToolTokens = mcpServers.reduce((sum, s) => sum + s.estimatedTokens, 0);

  const totalOverhead =
    SYSTEM_PROMPT_TOKENS +
    BUILT_IN_TOOLS_TOKENS +
    mcpToolTokens +
    claudeMd.totalTokens +
    AUTOCOMPACT_BUFFER_TOKENS;

  const effectiveWindow = CONTEXT_WINDOW_SIZE - totalOverhead;
  const percentUsable = (effectiveWindow / CONTEXT_WINDOW_SIZE) * 100;

  return {
    systemPrompt: SYSTEM_PROMPT_TOKENS,
    builtInTools: BUILT_IN_TOOLS_TOKENS,
    claudeMd: claudeMd.totalTokens,
    mcpTools: mcpToolTokens,
    autocompactBuffer: AUTOCOMPACT_BUFFER_TOKENS,
    totalOverhead,
    effectiveWindow,
    percentUsable,
  };
}
