import { homedir } from "node:os";
import { join, basename } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { ParsedSession, ParsedMessage, MessageUsage } from "../types/jsonl.js";
import type { BulkSession } from "./external.js";

/**
 * OpenTelemetry GenAI log-file ingestion (v3.1 — log-file mode only).
 *
 * All major coding agents (Gemini/Antigravity CLI, Codex OTel mode, OpenCode,
 * Qwen Code) can emit the OTel GenAI semantic conventions: a record per model
 * call carrying `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens` and
 * `gen_ai.request.model` / `gen_ai.response.model`. Users register their log
 * files (and which tool each maps to) in ~/.kerf/otel-sources.json:
 *
 *   [ { "path": "/Users/me/.gemini/telemetry.log", "tool": "gemini" } ]
 *
 * The parser tolerates two container shapes: OTLP/JSON batches (resourceLogs →
 * scopeLogs → logRecords) and newline-delimited JSON records. Attributes may be
 * an OTLP array (`[{key, value:{stringValue|intValue|...}}]`) or a plain map.
 *
 * This is tool-agnostic by design: the tool id comes from the source mapping (or
 * the `gen_ai.system` attribute), so the Gemini→Antigravity rename never breaks it.
 * Emitter schemas vary; field paths here follow the GenAI convention and may need
 * per-emitter tweaks.
 */
export const OTEL_SOURCES_PATH = join(homedir(), ".kerf", "otel-sources.json");

interface OtelSource {
  path: string;
  tool?: string;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function attrValue(v: any): unknown {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== "object") return v;
  // OTLP AnyValue
  if ("stringValue" in v) return v.stringValue;
  if ("intValue" in v) return num(v.intValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("boolValue" in v) return v.boolValue;
  return undefined;
}

/** Normalize a record's attributes (OTLP array form or plain map) into a map. */
function readAttrs(rec: any): Record<string, unknown> {
  const a = rec?.attributes ?? rec?.body?.attributes;
  if (!a) return {};
  if (Array.isArray(a)) {
    const out: Record<string, unknown> = {};
    for (const kv of a) {
      if (kv && typeof kv.key === "string") out[kv.key] = attrValue(kv.value);
    }
    return out;
  }
  if (typeof a === "object") return a as Record<string, unknown>;
  return {};
}

function nanosToIso(rec: any): string {
  const ns = rec?.timeUnixNano ?? rec?.observedTimeUnixNano;
  if (ns) {
    const ms = Number(BigInt(ns) / 1_000_000n);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (typeof rec?.timestamp === "string") return rec.timestamp;
  return "";
}

/** Flatten either an OTLP/JSON batch or JSONL content into raw log records. */
function flattenRecords(content: string): any[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  // Try a single OTLP/JSON batch first.
  try {
    const doc = JSON.parse(trimmed);
    if (doc && Array.isArray(doc.resourceLogs)) {
      const records: any[] = [];
      for (const rl of doc.resourceLogs) {
        for (const sl of rl.scopeLogs ?? rl.scope_logs ?? []) {
          for (const lr of sl.logRecords ?? sl.log_records ?? []) {
            records.push(lr);
          }
        }
      }
      return records;
    }
    // A single bare record.
    if (doc && typeof doc === "object") return [doc];
  } catch {
    // fall through to JSONL
  }

  // JSONL: one record per line.
  const out: any[] = [];
  for (const line of trimmed.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // skip malformed line
    }
  }
  return out;
}

function usageFromAttrs(attrs: Record<string, unknown>): MessageUsage | null {
  const input = num(
    attrs["gen_ai.usage.input_tokens"] ?? attrs["gen_ai.usage.prompt_tokens"],
  );
  const output = num(
    attrs["gen_ai.usage.output_tokens"] ?? attrs["gen_ai.usage.completion_tokens"],
  );
  const cacheRead = num(
    attrs["gen_ai.usage.cached_input_tokens"] ??
      attrs["gen_ai.usage.cache_read_input_tokens"] ??
      attrs["gen_ai.usage.cached_tokens"],
  );
  if (input === 0 && output === 0 && cacheRead === 0) return null;
  return {
    // GenAI input_tokens is the full prompt; split out the cached portion.
    input_tokens: Math.max(0, input - cacheRead),
    output_tokens: output,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: 0,
  };
}

/**
 * Parse OTel log content into BulkSessions, grouping records by their GenAI
 * conversation/session id (falling back to one session per file).
 */
export function parseOtelLogContent(
  content: string,
  defaultTool: string,
  sourceFile: string,
): BulkSession[] {
  const records = flattenRecords(content);
  const fallbackSession = `${defaultTool}-${basename(sourceFile).replace(/\.[^.]+$/, "")}`;

  // sessionId -> { tool, projectPath, messages }
  const groups = new Map<
    string,
    { tool: string; projectPath: string; messages: ParsedMessage[] }
  >();

  let idx = 0;
  for (const rec of records) {
    const attrs = readAttrs(rec);
    const usage = usageFromAttrs(attrs);
    if (!usage) continue;

    const sessionId =
      (attrs["gen_ai.conversation.id"] as string) ??
      (attrs["session.id"] as string) ??
      (attrs["gen_ai.session.id"] as string) ??
      fallbackSession;
    const tool = (attrs["gen_ai.system"] as string) || defaultTool;
    const projectPath =
      (attrs["project.path"] as string) ?? (attrs["cwd"] as string) ?? tool;
    const model =
      (attrs["gen_ai.response.model"] as string) ??
      (attrs["gen_ai.request.model"] as string) ??
      (attrs["gen_ai.model"] as string) ??
      "unknown";

    const group =
      groups.get(sessionId) ?? { tool, projectPath, messages: [] };
    group.messages.push({
      id: `${sessionId}-${idx++}`,
      sessionId,
      model,
      timestamp: nanosToIso(rec),
      usage,
      totalCostUsd: null,
    });
    groups.set(sessionId, group);
  }

  const out: BulkSession[] = [];
  for (const [sessionId, g] of groups) {
    if (g.messages.length === 0) continue;
    const totals = g.messages.reduce(
      (acc, m) => ({
        input: acc.input + m.usage.input_tokens,
        output: acc.output + m.usage.output_tokens,
        cacheRead: acc.cacheRead + m.usage.cache_read_input_tokens,
        cacheCreation: acc.cacheCreation + m.usage.cache_creation_input_tokens,
      }),
      { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    );
    const timestamps = g.messages.map((m) => m.timestamp).filter(Boolean).sort();
    const session: ParsedSession = {
      sessionId,
      filePath: sourceFile,
      messages: g.messages,
      totalInputTokens: totals.input,
      totalOutputTokens: totals.output,
      totalCacheReadTokens: totals.cacheRead,
      totalCacheCreationTokens: totals.cacheCreation,
      totalCostUsd: 0,
      startTime: timestamps[0] ?? "",
      endTime: timestamps[timestamps.length - 1] ?? "",
      messageCount: g.messages.length,
    };
    out.push({ tool: g.tool, projectPath: g.projectPath, session, sourceFile });
  }
  return out;
}

/** Load OTel sessions from the configured sources file. Returns [] if absent/invalid. */
export function loadOtelSessions(sourcesPath: string = OTEL_SOURCES_PATH): BulkSession[] {
  if (!existsSync(sourcesPath)) return [];
  let sources: OtelSource[];
  try {
    const data = JSON.parse(readFileSync(sourcesPath, "utf-8"));
    sources = Array.isArray(data) ? data : [];
  } catch {
    return [];
  }

  const out: BulkSession[] = [];
  for (const src of sources) {
    if (!src || typeof src.path !== "string" || !existsSync(src.path)) continue;
    const tool = typeof src.tool === "string" && src.tool ? src.tool : "external";
    try {
      const content = readFileSync(src.path, "utf-8");
      out.push(...parseOtelLogContent(content, tool, src.path));
    } catch {
      // skip unreadable source
    }
  }
  return out;
}
