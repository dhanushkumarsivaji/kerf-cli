import { readFileSync, statSync, readdirSync, openSync, readSync, closeSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";

import dayjs from "dayjs";
import { watch } from "chokidar";
import { CLAUDE_PROJECTS_DIR, BILLING_WINDOW_HOURS } from "./config.js";
import type {
  RawJsonlMessage,
  ParsedMessage,
  SessionData,
  ParsedSession,
  MessageUsage,
} from "../types/jsonl.js";

const DEFAULT_USAGE: MessageUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

function extractUsage(raw: RawJsonlMessage): Partial<MessageUsage> | null {
  return raw.message?.usage ?? raw.usage ?? raw.delta?.usage ?? null;
}

function extractMessageId(raw: RawJsonlMessage): string | null {
  return raw.message?.id ?? null;
}

function extractModel(raw: RawJsonlMessage): string | null {
  return raw.message?.model ?? null;
}

function extractTimestamp(raw: RawJsonlMessage): string {
  return raw.timestamp ?? dayjs().toISOString();
}

export function parseJsonlLine(line: string): RawJsonlMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as RawJsonlMessage;
  } catch {
    return null;
  }
}

export function parseJsonlContent(content: string, sessionId: string): ParsedMessage[] {
  const lines = content.split("\n");
  const messageMap = new Map<string, ParsedMessage>();
  let anonymousCounter = 0;

  for (const line of lines) {
    const raw = parseJsonlLine(line);
    if (!raw) continue;

    const usage = extractUsage(raw);
    if (!usage) continue;

    const id = extractMessageId(raw) ?? `anon_${anonymousCounter++}`;
    const model = extractModel(raw) ?? "unknown";
    const timestamp = extractTimestamp(raw);

    const existing = messageMap.get(id);
    const parsedUsage: MessageUsage = {
      input_tokens: usage.input_tokens ?? existing?.usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? existing?.usage.output_tokens ?? 0,
      cache_creation_input_tokens:
        usage.cache_creation_input_tokens ?? existing?.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens:
        usage.cache_read_input_tokens ?? existing?.usage.cache_read_input_tokens ?? 0,
    };

    // Deduplicate by message id — take the LAST occurrence (handles streaming intermediates)
    messageMap.set(id, {
      id,
      sessionId,
      model: model !== "unknown" ? model : existing?.model ?? "unknown",
      timestamp,
      usage: parsedUsage,
      totalCostUsd: raw.total_cost_usd ?? existing?.totalCostUsd ?? null,
    });
  }

  return Array.from(messageMap.values());
}

export function parseSessionFile(filePath: string): ParsedSession {
  const content = readFileSync(filePath, "utf-8");
  const sessionId = basename(filePath, ".jsonl");
  const messages = parseJsonlContent(content, sessionId);

  const totals = messages.reduce(
    (acc, msg) => ({
      input: acc.input + msg.usage.input_tokens,
      output: acc.output + msg.usage.output_tokens,
      cacheRead: acc.cacheRead + msg.usage.cache_read_input_tokens,
      cacheCreation: acc.cacheCreation + msg.usage.cache_creation_input_tokens,
      cost: acc.cost + (msg.totalCostUsd ?? 0),
    }),
    { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cost: 0 },
  );

  const timestamps = messages.map((m) => m.timestamp).sort();

  return {
    sessionId,
    filePath,
    messages,
    totalInputTokens: totals.input,
    totalOutputTokens: totals.output,
    totalCacheReadTokens: totals.cacheRead,
    totalCacheCreationTokens: totals.cacheCreation,
    totalCostUsd: totals.cost,
    startTime: timestamps[0] ?? "",
    endTime: timestamps[timestamps.length - 1] ?? "",
    messageCount: messages.length,
  };
}

export async function findJsonlFiles(baseDir?: string): Promise<string[]> {
  const dir = baseDir ?? CLAUDE_PROJECTS_DIR;
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

export function findJsonlFilesSync(baseDir?: string): string[] {
  const dir = baseDir ?? CLAUDE_PROJECTS_DIR;
  const files: string[] = [];

  function walkSync(currentDir: string): void {
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walkSync(fullPath);
      } else if (entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }

  walkSync(dir);
  return files;
}

export async function getActiveSessions(baseDir?: string): Promise<SessionData[]> {
  const files = await findJsonlFiles(baseDir);
  const cutoff = dayjs().subtract(BILLING_WINDOW_HOURS, "hour");
  const activeSessions: SessionData[] = [];

  for (const filePath of files) {
    try {
      const stat = statSync(filePath);
      const lastModified = dayjs(stat.mtime);
      if (lastModified.isAfter(cutoff)) {
        const content = readFileSync(filePath, "utf-8");
        const sessionId = basename(filePath, ".jsonl");
        const messages = parseJsonlContent(content, sessionId);

        if (messages.length === 0) continue;

        const timestamps = messages.map((m) => m.timestamp).sort();
        activeSessions.push({
          sessionId,
          filePath,
          messages,
          startTime: timestamps[0] ?? "",
          endTime: timestamps[timestamps.length - 1] ?? "",
          lastModified: stat.mtime,
        });
      }
    } catch {
      continue;
    }
  }

  return activeSessions.sort(
    (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
  );
}

export interface StreamingParser {
  onMessage: (callback: (msg: ParsedMessage) => void) => void;
  stop: () => void;
}

export function createStreamingParser(filePath: string): StreamingParser {
  const callbacks: Array<(msg: ParsedMessage) => void> = [];
  const sessionId = basename(filePath, ".jsonl");
  let anonymousCounter = 0;
  let lastReadPosition = 0;

  // Set initial position to end of file
  try {
    const stat = statSync(filePath);
    lastReadPosition = stat.size;
  } catch {
    // File might not exist yet
  }

  const watcher = watch(filePath, { persistent: true });

  watcher.on("change", () => {
    try {
      const stat = statSync(filePath);
      if (stat.size <= lastReadPosition) {
        lastReadPosition = stat.size;
        return;
      }

      // Read only new bytes since last position
      const fd = openSync(filePath, "r");
      const buffer = Buffer.alloc(stat.size - lastReadPosition);
      readSync(fd, buffer, 0, buffer.length, lastReadPosition);
      closeSync(fd);
      lastReadPosition = stat.size;

      const newContent = buffer.toString("utf-8");
      const lines = newContent.split("\n");

      for (const line of lines) {
        const raw = parseJsonlLine(line);
        if (!raw) continue;
        const usage = extractUsage(raw);
        if (!usage) continue;

        const id = extractMessageId(raw) ?? `anon_${anonymousCounter++}`;
        const model = extractModel(raw) ?? "unknown";
        const timestamp = extractTimestamp(raw);

        const msg: ParsedMessage = {
          id,
          sessionId,
          model,
          timestamp,
          usage: {
            input_tokens: usage.input_tokens ?? 0,
            output_tokens: usage.output_tokens ?? 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          },
          totalCostUsd: raw.total_cost_usd ?? null,
        };

        for (const cb of callbacks) {
          cb(msg);
        }
      }
    } catch {
      // File may be in the middle of a write
    }
  });

  return {
    onMessage(callback) {
      callbacks.push(callback);
    },
    stop() {
      watcher.close();
    },
  };
}
