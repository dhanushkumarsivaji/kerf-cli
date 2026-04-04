import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek.js";
import { basename } from "node:path";
import { initDatabase } from "../db/schema.js";
import { runMigrations } from "../db/migrations.js";
import type { BudgetStatus } from "../types/config.js";
import type Database from "better-sqlite3";

dayjs.extend(isoWeek);

type BudgetPeriod = "daily" | "weekly" | "monthly";

export class BudgetManager {
  private db: Database.Database;

  constructor(dbPath?: string) {
    this.db = initDatabase(dbPath);
    runMigrations(this.db);
  }

  private getOrCreateProject(projectPath: string): number {
    const name = basename(projectPath) || projectPath;
    const existing = this.db
      .prepare("SELECT id FROM projects WHERE path = ?")
      .get(projectPath) as { id: number } | undefined;

    if (existing) return existing.id;

    const result = this.db
      .prepare("INSERT INTO projects (name, path) VALUES (?, ?)")
      .run(name, projectPath);

    return Number(result.lastInsertRowid);
  }

  setBudget(projectPath: string, amount: number, period: BudgetPeriod): void {
    const projectId = this.getOrCreateProject(projectPath);
    this.db
      .prepare(
        `INSERT INTO budgets (project_id, amount_usd, period)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id, period)
         DO UPDATE SET amount_usd = excluded.amount_usd`,
      )
      .run(projectId, amount, period);
  }

  getBudget(projectPath: string): { amount: number; period: BudgetPeriod } | null {
    const project = this.db
      .prepare("SELECT id FROM projects WHERE path = ?")
      .get(projectPath) as { id: number } | undefined;

    if (!project) return null;

    const budget = this.db
      .prepare("SELECT amount_usd, period FROM budgets WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(project.id) as { amount_usd: number; period: BudgetPeriod } | undefined;

    if (!budget) return null;
    return { amount: budget.amount_usd, period: budget.period };
  }

  recordUsage(
    projectPath: string,
    sessionId: string,
    tokensIn: number,
    tokensOut: number,
    costUsd: number,
    timestamp: string,
  ): void {
    const projectId = this.getOrCreateProject(projectPath);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO usage_snapshots (project_id, session_id, tokens_in, tokens_out, cost_usd, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(projectId, sessionId, tokensIn, tokensOut, costUsd, timestamp);
  }

  getUsage(projectPath: string, period: BudgetPeriod): number {
    const project = this.db
      .prepare("SELECT id FROM projects WHERE path = ?")
      .get(projectPath) as { id: number } | undefined;

    if (!project) return 0;

    const start = getPeriodStart(period);
    const result = this.db
      .prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) as total
         FROM usage_snapshots
         WHERE project_id = ? AND timestamp >= ?`,
      )
      .get(project.id, start.toISOString()) as { total: number };

    return result.total;
  }

  checkBudget(projectPath: string): BudgetStatus | null {
    const budgetConfig = this.getBudget(projectPath);
    if (!budgetConfig) return null;

    const spent = this.getUsage(projectPath, budgetConfig.period);
    const remaining = Math.max(0, budgetConfig.amount - spent);
    const percentUsed = budgetConfig.amount > 0 ? (spent / budgetConfig.amount) * 100 : 0;

    const periodStart = getPeriodStart(budgetConfig.period);
    const periodEnd = getPeriodEnd(budgetConfig.period);

    return {
      budget: budgetConfig.amount,
      spent,
      remaining,
      percentUsed,
      isOverBudget: spent > budgetConfig.amount,
      period: budgetConfig.period,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };
  }

  listProjects(): Array<{ name: string; path: string; budget: number | null; period: string | null; spent: number }> {
    const rows = this.db
      .prepare(
        `SELECT p.name, p.path, b.amount_usd, b.period
         FROM projects p
         LEFT JOIN budgets b ON b.project_id = p.id
         ORDER BY p.name`,
      )
      .all() as Array<{ name: string; path: string; amount_usd: number | null; period: string | null }>;

    return rows.map((row) => ({
      name: row.name,
      path: row.path,
      budget: row.amount_usd,
      period: row.period,
      spent: row.period ? this.getUsage(row.path, row.period as BudgetPeriod) : 0,
    }));
  }

  removeBudget(projectPath: string): boolean {
    const project = this.db
      .prepare("SELECT id FROM projects WHERE path = ?")
      .get(projectPath) as { id: number } | undefined;

    if (!project) return false;

    const result = this.db.prepare("DELETE FROM budgets WHERE project_id = ?").run(project.id);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}

function getPeriodStart(period: BudgetPeriod): dayjs.Dayjs {
  switch (period) {
    case "daily":
      return dayjs().startOf("day");
    case "weekly":
      return dayjs().startOf("isoWeek" as dayjs.OpUnitType);
    case "monthly":
      return dayjs().startOf("month");
  }
}

function getPeriodEnd(period: BudgetPeriod): dayjs.Dayjs {
  switch (period) {
    case "daily":
      return dayjs().endOf("day");
    case "weekly":
      return dayjs().endOf("isoWeek" as dayjs.OpUnitType);
    case "monthly":
      return dayjs().endOf("month");
  }
}
