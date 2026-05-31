import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { ParsedSession, ParsedMessage, MessageUsage } from "../types/jsonl.js";

/**
 * External additions let users (or community exporters) import usage from tools
 * that don't emit JSONL/OTel — Cursor, Copilot, etc. — by dropping a JSON file at
 * ~/.kerf/external-additions.json. Schema:
 *
 * {
 *   "tool": "cursor",
 *   "sessions": [
 *     {
 *       "sessionId": "cursor-2026-05-29-001",
 *       "projectPath": "/code/myapp",
 *       "messages": [
 *         { "id": "m1", "model": "claude-sonnet-4", "timestamp": "2026-05-29T10:00:00Z",
 *           "input_tokens": 1200, "output_tokens": 800,
 *           "cache_read_input_tokens": 5000, "cache_creation_input_tokens": 0 }
 *       ]
 *     }
 *   ]
 * }
 *
 * `tool` may also be set per-session (overrides the top-level tool). `cost_usd`
 * may be supplied per message to bypass pricing; otherwise kerf computes it.
 */
export const EXTERNAL_ADDITIONS_PATH = join(homedir(), ".kerf", "external-additions.json");

export interface ExternalMessage {
  id: string;
  model?: string;
  timestamp?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cost_usd?: number;
}

export interface ExternalSession {
  sessionId: string;
  projectPath?: string;
  tool?: string;
  messages: ExternalMessage[];
}

export interface ExternalAdditionsFile {
  tool?: string;
  sessions: ExternalSession[];
}

export interface BulkSession {
  tool: string;
  projectPath: string;
  session: ParsedSession;
  sourceFile: string;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function toUsage(m: ExternalMessage): MessageUsage {
  return {
    input_tokens: num(m.input_tokens),
    output_tokens: num(m.output_tokens),
    cache_read_input_tokens: num(m.cache_read_input_tokens),
    cache_creation_input_tokens: num(m.cache_creation_input_tokens),
  };
}

/**
 * Validate and normalize an external-additions object into BulkSessions.
 * Throws on a structurally invalid document so callers can surface the error.
 */
export function parseExternalAdditions(data: unknown, sourceFile: string): BulkSession[] {
  if (typeof data !== "object" || data === null || !Array.isArray((data as any).sessions)) {
    throw new Error(
      "Invalid external-additions file: expected an object with a 'sessions' array.",
    );
  }
  const file = data as ExternalAdditionsFile;
  const defaultTool = typeof file.tool === "string" && file.tool ? file.tool : "external";

  const out: BulkSession[] = [];
  for (const s of file.sessions) {
    if (!s || typeof s.sessionId !== "string" || !Array.isArray(s.messages)) continue;
    const tool = typeof s.tool === "string" && s.tool ? s.tool : defaultTool;
    const projectPath = typeof s.projectPath === "string" && s.projectPath ? s.projectPath : tool;

    const messages: ParsedMessage[] = s.messages
      .filter((m) => m && typeof m.id === "string")
      .map((m) => ({
        id: m.id,
        sessionId: s.sessionId,
        model: typeof m.model === "string" && m.model ? m.model : "unknown",
        timestamp: typeof m.timestamp === "string" && m.timestamp ? m.timestamp : "",
        usage: toUsage(m),
        totalCostUsd: typeof m.cost_usd === "number" ? m.cost_usd : null,
      }));

    if (messages.length === 0) continue;

    const totals = messages.reduce(
      (acc, m) => ({
        input: acc.input + m.usage.input_tokens,
        output: acc.output + m.usage.output_tokens,
        cacheRead: acc.cacheRead + m.usage.cache_read_input_tokens,
        cacheCreation: acc.cacheCreation + m.usage.cache_creation_input_tokens,
      }),
      { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    );
    const timestamps = messages.map((m) => m.timestamp).filter(Boolean).sort();

    const session: ParsedSession = {
      sessionId: s.sessionId,
      filePath: sourceFile,
      messages,
      totalInputTokens: totals.input,
      totalOutputTokens: totals.output,
      totalCacheReadTokens: totals.cacheRead,
      totalCacheCreationTokens: totals.cacheCreation,
      totalCostUsd: 0,
      startTime: timestamps[0] ?? "",
      endTime: timestamps[timestamps.length - 1] ?? "",
      messageCount: messages.length,
    };

    out.push({ tool, projectPath, session, sourceFile });
  }

  return out;
}

/** Load external additions from disk. Returns [] if the file is absent or invalid. */
export function loadExternalSessions(path: string = EXTERNAL_ADDITIONS_PATH): BulkSession[] {
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return parseExternalAdditions(data, path);
  } catch {
    return [];
  }
}
