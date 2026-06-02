import type Database from "better-sqlite3";

export interface CiCostFilters {
  /** Git branch to attribute cost to (matched against messages.git_branch). */
  branch?: string | null;
  /** Project path filter (typically the repo root). */
  project?: string | null;
  /** Only count messages at/after this ISO date. */
  since?: string | null;
}

export interface CiCostResult {
  branch: string | null;
  project: string | null;
  since: string | null;
  totalCostUsd: number;
  messageCount: number;
  sessionCount: number;
  byModel: Array<{ model: string; costUsd: number; messages: number }>;
}

/**
 * Sum AI cost attributable to a branch (and optionally project / since-date)
 * from kerf's local analytics DB. Designed to run where the usage data lives —
 * the developer's machine — as a pre-push check or PR-comment source.
 */
export function computeCiCost(db: Database.Database, filters: CiCostFilters): CiCostResult {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.branch) {
    where.push("git_branch = ?");
    params.push(filters.branch);
  }
  if (filters.project) {
    where.push("project_path = ?");
    params.push(filters.project);
  }
  if (filters.since) {
    where.push("timestamp >= ?");
    params.push(filters.since);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const totals = db
    .prepare(
      `SELECT
        COALESCE(SUM(cost_usd), 0) as cost,
        COUNT(*) as messages,
        COUNT(DISTINCT session_id) as sessions
       FROM messages ${whereSql}`,
    )
    .get(...params) as { cost: number; messages: number; sessions: number };

  const byModel = (
    db
      .prepare(
        `SELECT model, ROUND(SUM(cost_usd), 4) as cost, COUNT(*) as messages
         FROM messages ${whereSql} GROUP BY model ORDER BY cost DESC`,
      )
      .all(...params) as Array<{ model: string; cost: number; messages: number }>
  ).map((r) => ({ model: r.model, costUsd: r.cost, messages: r.messages }));

  return {
    branch: filters.branch ?? null,
    project: filters.project ?? null,
    since: filters.since ?? null,
    totalCostUsd: totals.cost,
    messageCount: totals.messages,
    sessionCount: totals.sessions,
    byModel,
  };
}

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Render the cost result as a Markdown block suitable for a PR comment / job summary. */
export function renderCiMarkdown(result: CiCostResult): string {
  const lines: string[] = [];
  lines.push("### 🪚 kerf — AI coding cost for this branch");
  lines.push("");
  lines.push(`**Branch:** \`${result.branch ?? "(all)"}\``);
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Total cost | **${fmt(result.totalCostUsd)}** |`);
  lines.push(`| Messages | ${result.messageCount} |`);
  lines.push(`| Sessions | ${result.sessionCount} |`);
  if (result.byModel.length > 0) {
    lines.push("");
    lines.push("| Model | Cost | Messages |");
    lines.push("| --- | --- | --- |");
    for (const m of result.byModel) {
      lines.push(`| ${m.model} | ${fmt(m.costUsd)} | ${m.messages} |`);
    }
  }
  if (result.messageCount === 0) {
    lines.push("");
    lines.push(
      "_No tagged usage found for this branch in the local kerf database._",
    );
  }
  return lines.join("\n");
}
