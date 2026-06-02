import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runMigrations } from "../src/db/migrations.js";
import { MCP_TOOLS, runTool } from "../src/mcp/tools.js";
import { createMcpServer } from "../src/mcp/server.js";

let msgN = 0;
function seed(db: Database.Database, opts: { tool?: string; model?: string; cost: number; input?: number; output?: number }): void {
  db.prepare(
    `INSERT INTO messages
      (message_id, session_id, project_path, model, timestamp, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, source_file, tool)
     VALUES (?, ?, ?, ?, datetime('now'), ?, ?, 0, 0, ?, ?, ?)`,
  ).run(
    `m${msgN++}`,
    `s${msgN}`,
    "/proj",
    opts.model ?? "claude-sonnet-4-20250514",
    opts.input ?? 1000,
    opts.output ?? 500,
    opts.cost,
    "/proj/s.jsonl",
    opts.tool ?? "claude-code",
  );
}

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("runTool", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = freshDb();
    msgN = 0;
  });
  afterEach(() => db.close());

  it("kerf_summary returns totals and breakdowns", () => {
    seed(db, { tool: "claude-code", cost: 2 });
    seed(db, { tool: "codex", model: "gpt-5-codex", cost: 1 });
    const res = runTool(db, "kerf_summary", { period: "all" }) as any;
    expect(res.totals.cost_usd).toBeCloseTo(3, 5);
    expect(res.totals.message_count).toBe(2);
    expect(res.byTool.map((t: any) => t.tool).sort()).toEqual(["claude-code", "codex"]);
  });

  it("kerf_summary filters by tool", () => {
    seed(db, { tool: "claude-code", cost: 2 });
    seed(db, { tool: "codex", cost: 1 });
    const res = runTool(db, "kerf_summary", { period: "all", tool: "codex" }) as any;
    expect(res.totals.cost_usd).toBeCloseTo(1, 5);
  });

  it("kerf_query runs a read-only SELECT", () => {
    seed(db, { cost: 5 });
    const res = runTool(db, "kerf_query", {
      sql: "SELECT COUNT(*) as n, SUM(cost_usd) as cost FROM messages",
    }) as any;
    expect(res.rows[0].n).toBe(1);
    expect(res.rows[0].cost).toBeCloseTo(5, 5);
    expect(res.columns).toContain("n");
  });

  it("kerf_query REJECTS write statements (safety requirement)", () => {
    for (const sql of [
      "INSERT INTO messages (message_id) VALUES ('x')",
      "UPDATE messages SET cost_usd = 0",
      "DELETE FROM messages",
      "DROP TABLE messages",
      "ALTER TABLE messages ADD COLUMN x TEXT",
    ]) {
      expect(() => runTool(db, "kerf_query", { sql })).toThrow(/read-only/i);
    }
    // The data is untouched.
    seed(db, { cost: 1 });
    const n = db.prepare("SELECT COUNT(*) as n FROM messages").get() as { n: number };
    expect(n.n).toBe(1);
  });

  it("kerf_query rejects empty sql", () => {
    expect(() => runTool(db, "kerf_query", { sql: "  " })).toThrow();
  });

  it("kerf_efficiency returns a report", () => {
    seed(db, { model: "claude-opus-4-20250514", cost: 10 });
    const res = runTool(db, "kerf_efficiency", { period: "all" }) as any;
    expect(res.report).toBeDefined();
    expect(res.report.totalCostUsd).toBeCloseTo(10, 5);
    expect(Array.isArray(res.crossToolRecommendations)).toBe(true);
  });

  it("kerf_forecast returns a projection", () => {
    seed(db, { cost: 3 });
    const res = runTool(db, "kerf_forecast", { period: "month" }) as any;
    expect(res.period).toBe("month");
    expect(typeof res.projectedTotal).toBe("number");
  });

  it("throws on unknown tool and invalid period", () => {
    expect(() => runTool(db, "nope", {})).toThrow(/unknown tool/i);
    expect(() => runTool(db, "kerf_summary", { period: "decade" })).toThrow(/invalid period/i);
  });
});

describe("MCP server (client <-> server over in-memory transport)", () => {
  let db: Database.Database;
  let client: Client;

  beforeEach(async () => {
    db = freshDb();
    msgN = 0;
    seed(db, { tool: "claude-code", cost: 4 });

    const server = createMcpServer(db);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    db.close();
  });

  it("lists all kerf tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(MCP_TOOLS.map((t) => t.name).sort());
    // Each tool advertises a JSON-Schema object input.
    for (const t of tools) expect(t.inputSchema.type).toBe("object");
  });

  it("calls kerf_summary and returns JSON text content", async () => {
    const res = await client.callTool({ name: "kerf_summary", arguments: { period: "all" } });
    expect(res.isError).toBeFalsy();
    const content = (res.content as Array<{ type: string; text: string }>)[0]!;
    expect(content.type).toBe("text");
    const parsed = JSON.parse(content.text);
    expect(parsed.totals.cost_usd).toBeCloseTo(4, 5);
  });

  it("returns isError for a rejected write query", async () => {
    const res = await client.callTool({
      name: "kerf_query",
      arguments: { sql: "DELETE FROM messages" },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0]!.text;
    expect(text).toMatch(/read-only/i);
  });
});
