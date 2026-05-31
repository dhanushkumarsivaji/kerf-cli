import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrations.js";
import { IngestService } from "../src/core/ingest.js";
import {
  parseExternalAdditions,
  loadExternalSessions,
} from "../src/adapters/external.js";

const SAMPLE = {
  tool: "cursor",
  sessions: [
    {
      sessionId: "cursor-2026-05-29-001",
      projectPath: "/code/myapp",
      messages: [
        {
          id: "m1",
          model: "claude-sonnet-4",
          timestamp: "2026-05-29T10:00:00Z",
          input_tokens: 1200,
          output_tokens: 800,
          cache_read_input_tokens: 5000,
          cache_creation_input_tokens: 0,
        },
        {
          id: "m2",
          model: "claude-sonnet-4",
          timestamp: "2026-05-29T10:05:00Z",
          input_tokens: 300,
          output_tokens: 150,
        },
      ],
    },
  ],
};

describe("parseExternalAdditions", () => {
  it("parses a valid additions file into a BulkSession", () => {
    const sessions = parseExternalAdditions(SAMPLE, "/tmp/ext.json");
    expect(sessions).toHaveLength(1);
    const s = sessions[0]!;
    expect(s.tool).toBe("cursor");
    expect(s.projectPath).toBe("/code/myapp");
    expect(s.session.messageCount).toBe(2);
    expect(s.session.totalInputTokens).toBe(1500);
    expect(s.session.totalCacheReadTokens).toBe(5000);
    expect(s.session.messages[0]!.usage.output_tokens).toBe(800);
  });

  it("lets a session override the top-level tool", () => {
    const data = {
      tool: "cursor",
      sessions: [
        { sessionId: "s", tool: "copilot", messages: [{ id: "m", input_tokens: 10 }] },
      ],
    };
    const [s] = parseExternalAdditions(data, "/tmp/ext.json");
    expect(s!.tool).toBe("copilot");
    // projectPath falls back to the tool name when omitted.
    expect(s!.projectPath).toBe("copilot");
  });

  it("throws on a structurally invalid document", () => {
    expect(() => parseExternalAdditions({ nope: true }, "/tmp/x.json")).toThrow();
    expect(() => parseExternalAdditions(null, "/tmp/x.json")).toThrow();
  });

  it("skips sessions with no valid messages", () => {
    const data = { tool: "x", sessions: [{ sessionId: "empty", messages: [] }] };
    expect(parseExternalAdditions(data, "/tmp/x.json")).toHaveLength(0);
  });
});

describe("loadExternalSessions", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kerf-ext-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when the file is missing", () => {
    expect(loadExternalSessions(join(dir, "nope.json"))).toEqual([]);
  });

  it("returns [] on malformed JSON", () => {
    const p = join(dir, "bad.json");
    writeFileSync(p, "{ not json");
    expect(loadExternalSessions(p)).toEqual([]);
  });

  it("ingests external sessions into the analytics DB under their tool id", () => {
    const p = join(dir, "ext.json");
    writeFileSync(p, JSON.stringify(SAMPLE));
    const sessions = loadExternalSessions(p);

    const db = new Database(":memory:");
    runMigrations(db);
    const ingest = new IngestService(db);
    const { files, newMessages } = ingest.ingestBulkSessions(sessions);
    expect(files).toBe(1);
    expect(newMessages).toBe(2);

    const row = db
      .prepare(`SELECT tool, COUNT(*) as n, SUM(cost_usd) as cost FROM messages GROUP BY tool`)
      .get() as { tool: string; n: number; cost: number };
    expect(row.tool).toBe("cursor");
    expect(row.n).toBe(2);
    expect(row.cost).toBeGreaterThan(0);
    db.close();
  });
});
