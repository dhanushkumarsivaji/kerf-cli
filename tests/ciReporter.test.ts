import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrations.js";
import { computeCiCost, renderCiMarkdown } from "../src/core/ciReporter.js";
import { parseJsonlContent } from "../src/core/parser.js";

let n = 0;
function insert(
  db: Database.Database,
  opts: { branch?: string | null; project?: string; model?: string; cost: number; ts?: string },
): void {
  db.prepare(
    `INSERT INTO messages
      (message_id, session_id, project_path, model, timestamp, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, source_file, tool, git_branch)
     VALUES (?, ?, ?, ?, ?, 100, 50, 0, 0, ?, ?, 'claude-code', ?)`,
  ).run(
    `m${n++}`,
    `sess-${opts.branch ?? "none"}`,
    opts.project ?? "/repo",
    opts.model ?? "claude-sonnet-4-20250514",
    opts.ts ?? "2026-06-01T10:00:00Z",
    opts.cost,
    "/repo/s.jsonl",
    opts.branch ?? null,
  );
}

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("computeCiCost", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = freshDb();
    n = 0;
  });
  afterEach(() => db.close());

  it("attributes cost to a single branch", () => {
    insert(db, { branch: "feature/x", cost: 3 });
    insert(db, { branch: "feature/x", cost: 2 });
    insert(db, { branch: "main", cost: 10 });
    const res = computeCiCost(db, { branch: "feature/x" });
    expect(res.totalCostUsd).toBeCloseTo(5, 5);
    expect(res.messageCount).toBe(2);
    expect(res.byModel[0]!.costUsd).toBeCloseTo(5, 5);
  });

  it("filters by project as well as branch", () => {
    insert(db, { branch: "feature/x", project: "/repo-a", cost: 3 });
    insert(db, { branch: "feature/x", project: "/repo-b", cost: 7 });
    const res = computeCiCost(db, { branch: "feature/x", project: "/repo-a" });
    expect(res.totalCostUsd).toBeCloseTo(3, 5);
  });

  it("filters by since date", () => {
    insert(db, { branch: "main", cost: 4, ts: "2026-05-01T00:00:00Z" });
    insert(db, { branch: "main", cost: 6, ts: "2026-06-10T00:00:00Z" });
    const res = computeCiCost(db, { branch: "main", since: "2026-06-01" });
    expect(res.totalCostUsd).toBeCloseTo(6, 5);
  });

  it("returns zeros when nothing matches the branch", () => {
    insert(db, { branch: "main", cost: 5 });
    const res = computeCiCost(db, { branch: "nonexistent" });
    expect(res.totalCostUsd).toBe(0);
    expect(res.messageCount).toBe(0);
  });
});

describe("renderCiMarkdown", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = freshDb();
    n = 0;
  });
  afterEach(() => db.close());

  it("produces a Markdown report with the branch, total, and a model table", () => {
    insert(db, { branch: "feature/y", model: "claude-opus-4-20250514", cost: 12.5 });
    const md = renderCiMarkdown(computeCiCost(db, { branch: "feature/y" }));
    expect(md).toContain("kerf");
    expect(md).toContain("`feature/y`");
    expect(md).toContain("**$12.50**");
    expect(md).toContain("| Model | Cost | Messages |");
    expect(md).toContain("claude-opus-4-20250514");
  });

  it("notes when there is no tagged usage for the branch", () => {
    const md = renderCiMarkdown(computeCiCost(db, { branch: "empty" }));
    expect(md).toContain("No tagged usage");
  });
});

describe("parser gitBranch extraction", () => {
  it("extracts a real branch and treats HEAD/missing as null", () => {
    const lines = [
      JSON.stringify({
        message: { id: "a", model: "claude-sonnet-4", usage: { input_tokens: 100, output_tokens: 10 } },
        timestamp: "2026-06-01T10:00:00Z",
        gitBranch: "feature/login",
      }),
      JSON.stringify({
        message: { id: "b", model: "claude-sonnet-4", usage: { input_tokens: 100, output_tokens: 10 } },
        timestamp: "2026-06-01T10:01:00Z",
        gitBranch: "HEAD",
      }),
      JSON.stringify({
        message: { id: "c", model: "claude-sonnet-4", usage: { input_tokens: 100, output_tokens: 10 } },
        timestamp: "2026-06-01T10:02:00Z",
      }),
    ].join("\n");
    const msgs = parseJsonlContent(lines, "sess");
    const byId = Object.fromEntries(msgs.map((m) => [m.id, m.gitBranch]));
    expect(byId.a).toBe("feature/login");
    expect(byId.b).toBeNull(); // HEAD → null
    expect(byId.c).toBeNull(); // missing → null
  });
});
