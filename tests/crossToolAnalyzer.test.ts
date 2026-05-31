import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrations.js";
import { analyzeCrossTool } from "../src/core/crossToolAnalyzer.js";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

let msgCounter = 0;
function insertMessage(
  db: Database.Database,
  opts: {
    session: string;
    model: string;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheCreation?: number;
    cost: number;
  },
): void {
  db.prepare(
    `INSERT INTO messages
      (message_id, session_id, project_path, model, timestamp,
       input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, source_file)
     VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)`,
  ).run(
    `m${msgCounter++}`,
    opts.session,
    "/proj",
    opts.model,
    opts.input ?? 0,
    opts.output ?? 0,
    opts.cacheRead ?? 0,
    opts.cacheCreation ?? 0,
    opts.cost,
    "/proj/sess.jsonl",
  );
}

describe("analyzeCrossTool", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
    msgCounter = 0;
  });

  afterEach(() => {
    db.close();
  });

  it("recommends a model downgrade when Opus dominates routine spend", () => {
    // Routine Opus sessions: low input, no cache creation, meaningful cost.
    for (let s = 0; s < 5; s++) {
      for (let m = 0; m < 5; m++) {
        insertMessage(db, {
          session: `opus-${s}`,
          model: "claude-opus-4-20250514",
          input: 2000,
          output: 1500,
          cost: 2,
        });
      }
    }
    const recs = analyzeCrossTool(db);
    const downgrade = recs.find((r) => r.kind === "model_downgrade");
    expect(downgrade).toBeDefined();
    expect(downgrade!.estimatedMonthlySavings).toBeGreaterThan(0);
  });

  it("recommends cache optimization when hit rate is low on costly traffic", () => {
    // High input, near-zero cache reads, high cost → low hit rate.
    for (let m = 0; m < 40; m++) {
      insertMessage(db, {
        session: "cold",
        model: "claude-sonnet-4-20250514",
        input: 50_000,
        output: 2000,
        cacheRead: 0,
        cost: 1,
      });
    }
    const recs = analyzeCrossTool(db);
    const cache = recs.find((r) => r.kind === "cache_optimization");
    expect(cache).toBeDefined();
    expect(cache!.estimatedMonthlySavings).toBeGreaterThan(0);
  });

  it("does not emit tool_consolidation without a tool column (single-tool install)", () => {
    insertMessage(db, {
      session: "s1",
      model: "claude-opus-4-20250514",
      input: 2000,
      cost: 2,
    });
    const recs = analyzeCrossTool(db);
    expect(recs.some((r) => r.kind === "tool_consolidation")).toBe(false);
  });

  it("emits tool_consolidation when multi-tool data is present", () => {
    // Simulate a future multi-tool schema by adding the tool column.
    db.exec(`ALTER TABLE messages ADD COLUMN tool TEXT`);

    const insertWithTool = (session: string, tool: string, cost: number) => {
      db.prepare(
        `INSERT INTO messages
          (message_id, session_id, project_path, model, timestamp,
           input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, source_file, tool)
         VALUES (?, ?, ?, ?, datetime('now'), ?, 0, 0, 0, ?, ?, ?)`,
      ).run(`m${msgCounter++}`, session, "/proj", "model-x", 1000, cost, "/proj/s.jsonl", tool);
    };

    // Routine work: expensive tool at $1/msg, cheap tool at $0.10/msg.
    for (let i = 0; i < 10; i++) insertWithTool(`exp-${i}`, "claude-code", 1.0);
    for (let i = 0; i < 10; i++) insertWithTool(`cheap-${i}`, "codex", 0.1);

    const recs = analyzeCrossTool(db);
    const consolidation = recs.find((r) => r.kind === "tool_consolidation");
    expect(consolidation).toBeDefined();
    expect(consolidation!.estimatedMonthlySavings).toBeGreaterThan(0);
    expect(consolidation!.description).toContain("claude-code");
  });

  it("returns no recommendations for trivial/cheap usage", () => {
    insertMessage(db, {
      session: "tiny",
      model: "claude-haiku-4-20250514",
      input: 100,
      output: 50,
      cost: 0.001,
    });
    const recs = analyzeCrossTool(db);
    expect(recs).toEqual([]);
  });
});
