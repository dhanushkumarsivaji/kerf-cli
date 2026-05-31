import { homedir } from "node:os";
import { join, basename } from "node:path";
import { existsSync, statSync, readFileSync, readdirSync } from "node:fs";
import dayjs from "dayjs";
import type { IngestAdapter, AdapterSessionFile, ToolId } from "./types.js";
import type { ParsedSession, ParsedMessage, MessageUsage } from "../types/jsonl.js";

function codexRoots(): string[] {
  const env = process.env.CODEX_HOME;
  if (env) return env.split(",").map((s) => s.trim()).filter(Boolean);
  return [join(homedir(), ".codex")];
}

function sessionsDir(root: string): string {
  return join(root, "sessions");
}

/** Recursively find all rollout-*.jsonl under a sessions dir. */
function walkRollouts(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...walkRollouts(full));
    } else if (e.isFile() && e.name.startsWith("rollout-") && e.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
  return out;
}

interface CodexUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

/**
 * Extract per-call usage from a Codex rollout event, normalized to kerf's shape.
 *
 * VERIFIED against Codex CLI/Desktop rollout files (cli_version 0.117.x): usage
 * is reported on `event_msg` lines with `payload.type === "token_count"`, where
 * `payload.info.last_token_usage` holds that single API call's usage. Codex's
 * `input_tokens` is the FULL prompt (it includes the cached portion), so we
 * subtract `cached_input_tokens` to get kerf's uncached `input_tokens` and map
 * the cached portion to `cache_read_input_tokens`. OpenAI bills no separate
 * cache-creation, so that stays 0.
 *
 * Falls back to OpenAI-style (`prompt_tokens`/`completion_tokens`/
 * `prompt_tokens_details.cached_tokens`) and Anthropic-style usage objects for
 * older/other rollout formats. Returns null when an event carries no usage.
 */
export function extractCodexUsage(raw: any): CodexUsage | null {
  const ltu = raw?.payload?.info?.last_token_usage;
  if (ltu && typeof ltu === "object") {
    const input = ltu.input_tokens ?? 0;
    const cached = ltu.cached_input_tokens ?? 0;
    const output = ltu.output_tokens ?? 0;
    if (input === 0 && output === 0 && cached === 0) return null;
    return {
      input_tokens: Math.max(0, input - cached),
      output_tokens: output,
      cache_read_input_tokens: cached,
      cache_creation_input_tokens: 0,
    };
  }

  // Fallback shapes (older Codex formats / OpenAI-style usage objects).
  const u = raw?.payload?.usage ?? raw?.usage ?? raw?.token_usage ?? null;
  if (!u || typeof u !== "object") return null;
  const input = u.input_tokens ?? u.prompt_tokens ?? 0;
  const output = u.output_tokens ?? u.completion_tokens ?? 0;
  const cacheRead =
    u.cache_read_input_tokens ?? u.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheCreation = u.cache_creation_input_tokens ?? 0;
  if (input === 0 && output === 0 && cacheRead === 0) return null;
  return {
    // prompt_tokens / input_tokens include the cached portion → subtract it.
    input_tokens: Math.max(0, input - cacheRead),
    output_tokens: output,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheCreation,
  };
}

function extractCodexTimestamp(raw: any): string {
  return raw?.timestamp ?? raw?.ts ?? raw?.payload?.created_at ?? dayjs().toISOString();
}

/** Pull the working directory (project path) out of a session_meta/turn_context event. */
function extractCwd(raw: any): string | null {
  const cwd = raw?.payload?.cwd ?? raw?.cwd ?? raw?.payload?.session?.cwd;
  return typeof cwd === "string" && cwd.length > 0 ? cwd : null;
}

/** Pull the model out of a turn_context/session_meta event. */
function extractModel(raw: any): string | null {
  const model = raw?.payload?.model ?? raw?.model ?? raw?.payload?.response?.model;
  return typeof model === "string" && model.length > 0 ? model : null;
}

export class CodexAdapter implements IngestAdapter {
  readonly id: ToolId = "codex";
  readonly displayName = "Codex CLI";

  isAvailable(): boolean {
    return codexRoots().some((r) => existsSync(sessionsDir(r)));
  }

  async discoverSessions(): Promise<AdapterSessionFile[]> {
    const out: AdapterSessionFile[] = [];
    for (const root of codexRoots()) {
      const dir = sessionsDir(root);
      if (!existsSync(dir)) continue;
      for (const filePath of walkRollouts(dir)) {
        try {
          const stat = statSync(filePath);
          out.push({
            filePath,
            tool: this.id,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        } catch {
          // skip
        }
      }
    }
    return out;
  }

  parseSession(file: AdapterSessionFile): ParsedSession | null {
    let content: string;
    try {
      content = readFileSync(file.filePath, "utf-8");
    } catch {
      return null;
    }

    const sessionId = basename(file.filePath).replace(/\.jsonl$/, "");
    const messages: ParsedMessage[] = [];
    let currentModel = "unknown";
    let prevUsageKey: string | null = null;
    let index = 0;

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let raw: any;
      try {
        raw = JSON.parse(trimmed);
      } catch {
        continue;
      }

      // Track the active model from turn_context / session_meta events.
      const model = extractModel(raw);
      if (model) currentModel = model;

      const usage = extractCodexUsage(raw);
      if (!usage) continue;

      // Codex re-emits some token_count events verbatim; skip consecutive
      // duplicates so per-message totals sum to Codex's reported session total.
      const key = `${usage.input_tokens}:${usage.output_tokens}:${usage.cache_read_input_tokens}`;
      if (key === prevUsageKey) continue;
      prevUsageKey = key;

      const merged: MessageUsage = {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
      };

      messages.push({
        id: `${sessionId}-${index++}`,
        sessionId,
        model: currentModel,
        timestamp: extractCodexTimestamp(raw),
        usage: merged,
        totalCostUsd: null, // computed downstream from pricing
      });
    }

    if (messages.length === 0) return null;

    const totals = messages.reduce(
      (acc, m) => ({
        input: acc.input + m.usage.input_tokens,
        output: acc.output + m.usage.output_tokens,
        cacheRead: acc.cacheRead + m.usage.cache_read_input_tokens,
        cacheCreation: acc.cacheCreation + m.usage.cache_creation_input_tokens,
      }),
      { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    );

    const timestamps = messages.map((m) => m.timestamp).sort();

    return {
      sessionId,
      filePath: file.filePath,
      messages,
      totalInputTokens: totals.input,
      totalOutputTokens: totals.output,
      totalCacheReadTokens: totals.cacheRead,
      totalCacheCreationTokens: totals.cacheCreation,
      totalCostUsd: 0, // ingest computes per-message cost
      startTime: timestamps[0] ?? "",
      endTime: timestamps[timestamps.length - 1] ?? "",
      messageCount: messages.length,
    };
  }

  resolveProjectPath(file: AdapterSessionFile): string {
    // Codex embeds the project cwd in session_meta / turn_context events.
    try {
      const content = readFileSync(file.filePath, "utf-8");
      for (const line of content.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        let raw: any;
        try {
          raw = JSON.parse(t);
        } catch {
          continue;
        }
        const cwd = extractCwd(raw);
        if (cwd) return cwd;
      }
    } catch {
      // ignore
    }
    return "codex";
  }
}
