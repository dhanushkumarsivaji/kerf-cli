import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrations.js";
import { IngestService } from "../src/core/ingest.js";
import type { IngestAdapter, AdapterSessionFile } from "../src/adapters/types.js";
import type { ParsedSession } from "../src/types/jsonl.js";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

/** A fake adapter that returns a fixed in-memory session — no filesystem. */
function fakeAdapter(
  id: AdapterSessionFile["tool"],
  session: ParsedSession,
  projectPath = "/proj",
): IngestAdapter {
  return {
    id,
    displayName: id,
    isAvailable: () => true,
    discoverSessions: async () => [],
    parseSession: () => session,
    resolveProjectPath: () => projectPath,
  };
}

function sampleSession(sessionId: string): ParsedSession {
  const messages = [
    {
      id: `${sessionId}-m1`,
      sessionId,
      model: "claude-sonnet-4-20250514",
      timestamp: "2026-05-01T10:00:00Z",
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 2000,
        cache_creation_input_tokens: 0,
      },
      totalCostUsd: null,
    },
  ];
  return {
    sessionId,
    filePath: `/sessions/${sessionId}.jsonl`,
    messages,
    totalInputTokens: 1000,
    totalOutputTokens: 500,
    totalCacheReadTokens: 2000,
    totalCacheCreationTokens: 0,
    totalCostUsd: 0,
    startTime: "2026-05-01T10:00:00Z",
    endTime: "2026-05-01T10:00:00Z",
    messageCount: 1,
  };
}

describe("IngestService (adapter-driven)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  afterEach(() => {
    db.close();
  });

  it("stamps ingested messages with the adapter's tool id", () => {
    const ingest = new IngestService(db);
    const session = sampleSession("s1");
    const file: AdapterSessionFile = {
      filePath: session.filePath,
      tool: "claude-code",
      size: 100,
      modified: "2026-05-01T10:00:00.000Z",
    };
    const result = ingest.ingestFile(file, fakeAdapter("claude-code", session));
    expect(result.newMessages).toBe(1);

    const row = db.prepare(`SELECT tool, project_path FROM messages WHERE session_id = 's1'`).get() as {
      tool: string;
      project_path: string;
    };
    expect(row.tool).toBe("claude-code");
    expect(row.project_path).toBe("/proj");

    const meta = db.prepare(`SELECT tool FROM sessions_meta WHERE session_id = 's1'`).get() as {
      tool: string;
    };
    expect(meta.tool).toBe("claude-code");
  });

  it("is idempotent when size+mtime are unchanged", () => {
    const ingest = new IngestService(db);
    const session = sampleSession("s2");
    const file: AdapterSessionFile = {
      filePath: session.filePath,
      tool: "claude-code",
      size: 100,
      modified: "2026-05-01T10:00:00.000Z",
    };
    const adapter = fakeAdapter("claude-code", session);
    expect(ingest.ingestFile(file, adapter).newMessages).toBe(1);
    const second = ingest.ingestFile(file, adapter);
    expect(second.skipped).toBe(true);
    expect(second.newMessages).toBe(0);
  });

  it("records different tools side by side", () => {
    const ingest = new IngestService(db);
    const cc = sampleSession("cc1");
    const cx = sampleSession("cx1");
    ingest.ingestFile(
      { filePath: cc.filePath, tool: "claude-code", size: 1, modified: "2026-05-01T00:00:00.000Z" },
      fakeAdapter("claude-code", cc),
    );
    ingest.ingestFile(
      { filePath: cx.filePath, tool: "codex", size: 1, modified: "2026-05-01T00:00:00.000Z" },
      fakeAdapter("codex", cx, "/codex-proj"),
    );

    const rows = db
      .prepare(`SELECT tool, COUNT(*) as n FROM messages GROUP BY tool ORDER BY tool`)
      .all() as Array<{ tool: string; n: number }>;
    expect(rows).toEqual([
      { tool: "claude-code", n: 1 },
      { tool: "codex", n: 1 },
    ]);
  });

  it("populates tool_breakdown in daily summaries", () => {
    const ingest = new IngestService(db);
    const cc = sampleSession("d1");
    ingest.ingestFile(
      { filePath: cc.filePath, tool: "claude-code", size: 1, modified: "2026-05-01T00:00:00.000Z" },
      fakeAdapter("claude-code", cc),
    );
    ingest.recomputeDailySummaries("2026-05-01");
    const row = db
      .prepare(`SELECT tool_breakdown FROM daily_summaries WHERE date = '2026-05-01'`)
      .get() as { tool_breakdown: string } | undefined;
    expect(row).toBeDefined();
    expect(JSON.parse(row!.tool_breakdown)).toHaveProperty("claude-code");
  });
});
