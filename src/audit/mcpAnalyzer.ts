import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { MCP_TOKENS_PER_TOOL } from "../core/config.js";
import type { McpServerInfo } from "../types/config.js";

export interface McpAnalysis {
  servers: McpServerInfo[];
  totalTools: number;
  totalTokens: number;
  heavyServers: McpServerInfo[];
  hasToolSearch: boolean;
  effectiveTokens: number;
  recommendations: string[];
}

const CLI_ALTERNATIVES: Record<string, string> = {
  playwright: "Consider using the built-in Bash tool with playwright CLI instead",
  puppeteer: "Consider using the built-in Bash tool with puppeteer scripts",
  filesystem: "Claude Code has built-in file tools (Read, Write, Edit, Glob, Grep)",
  github: "Consider using 'gh' CLI via Bash tool instead",
  slack: "Consider using 'slack' CLI or curl for API calls",
};

export function analyzeMcp(): McpAnalysis {
  const servers: McpServerInfo[] = [];
  const configPaths = [
    join(process.cwd(), ".mcp.json"),
    join(homedir(), ".claude.json"),
  ];

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue;
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      const mcpServers = raw.mcpServers ?? raw.mcp_servers ?? {};
      for (const [name, config] of Object.entries(mcpServers)) {
        const cfg = config as Record<string, unknown>;
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

  const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);
  const totalTokens = servers.reduce((sum, s) => sum + s.estimatedTokens, 0);
  const heavyServers = servers.filter((s) => s.isHeavy);

  // Check if Tool Search is enabled (reduces overhead by ~85%)
  let hasToolSearch = false;
  const settingsPaths = [
    join(process.cwd(), ".claude", "settings.json"),
    join(homedir(), ".claude", "settings.json"),
  ];
  for (const sp of settingsPaths) {
    if (!existsSync(sp)) continue;
    try {
      const settings = JSON.parse(readFileSync(sp, "utf-8"));
      if (settings.enableToolSearch || settings.tool_search) {
        hasToolSearch = true;
        break;
      }
    } catch {
      continue;
    }
  }

  const effectiveTokens = hasToolSearch ? Math.round(totalTokens * 0.15) : totalTokens;

  const recommendations: string[] = [];
  for (const server of heavyServers) {
    recommendations.push(
      `'${server.name}' has ${server.toolCount} tools (${server.estimatedTokens.toLocaleString()} tokens). Consider enabling Tool Search to reduce overhead by ~85%.`,
    );
  }

  for (const server of servers) {
    const alt = CLI_ALTERNATIVES[server.name.toLowerCase()];
    if (alt) {
      recommendations.push(`${server.name}: ${alt}`);
    }
  }

  return {
    servers,
    totalTools,
    totalTokens,
    heavyServers,
    hasToolSearch,
    effectiveTokens,
    recommendations,
  };
}
