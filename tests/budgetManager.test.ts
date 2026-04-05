import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BudgetManager } from "../src/core/budgetManager.js";

let tempDir: string;
let dbPath: string;
let manager: BudgetManager;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "kerf-test-"));
  dbPath = join(tempDir, "test.db");
  manager = new BudgetManager(dbPath);
});

afterEach(() => {
  manager.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("setBudget + getBudget", () => {
  it("sets and retrieves a weekly budget", () => {
    manager.setBudget("/test/project", 50, "weekly");
    const budget = manager.getBudget("/test/project");
    expect(budget).not.toBeNull();
    expect(budget!.amount).toBe(50);
    expect(budget!.period).toBe("weekly");
  });

  it("returns null for projects without budgets", () => {
    expect(manager.getBudget("/nonexistent")).toBeNull();
  });

  it("overwrites budget on same period", () => {
    manager.setBudget("/test/project", 50, "weekly");
    manager.setBudget("/test/project", 100, "weekly");
    expect(manager.getBudget("/test/project")!.amount).toBe(100);
  });

  it("supports daily, weekly, monthly periods", () => {
    manager.setBudget("/p1", 10, "daily");
    manager.setBudget("/p2", 50, "weekly");
    manager.setBudget("/p3", 200, "monthly");
    expect(manager.getBudget("/p1")!.period).toBe("daily");
    expect(manager.getBudget("/p2")!.period).toBe("weekly");
    expect(manager.getBudget("/p3")!.period).toBe("monthly");
  });
});

describe("recordUsage + getUsage", () => {
  it("records and sums usage within period", () => {
    manager.setBudget("/test/project", 50, "daily");
    const now = new Date().toISOString();
    manager.recordUsage("/test/project", "session-1", 1000, 500, 0.05, now);
    manager.recordUsage("/test/project", "session-2", 2000, 800, 0.10, now);
    const usage = manager.getUsage("/test/project", "daily");
    expect(usage).toBeCloseTo(0.15, 4);
  });

  it("ignores duplicate entries (UNIQUE constraint)", () => {
    manager.setBudget("/test/project", 50, "daily");
    const now = new Date().toISOString();
    manager.recordUsage("/test/project", "session-1", 1000, 500, 0.05, now);
    manager.recordUsage("/test/project", "session-1", 1000, 500, 0.05, now);
    const usage = manager.getUsage("/test/project", "daily");
    expect(usage).toBeCloseTo(0.05, 4);
  });

  it("returns 0 for projects with no usage", () => {
    manager.setBudget("/test/project", 50, "daily");
    expect(manager.getUsage("/test/project", "daily")).toBe(0);
  });
});

describe("checkBudget", () => {
  it("returns null for projects without budgets", () => {
    expect(manager.checkBudget("/nonexistent")).toBeNull();
  });

  it("calculates percentUsed correctly", () => {
    // Use a unique path that won't match any real JSONL files
    const projectPath = "/zzzz-kerf-no-match-aaaa";
    manager.setBudget(projectPath, 100, "daily");
    const now = new Date().toISOString();
    manager.recordUsage(projectPath, "s1", 1000, 500, 42.5, now);
    const status = manager.checkBudget(projectPath);
    expect(status).not.toBeNull();
    expect(status!.budget).toBe(100);
    expect(status!.spent).toBeCloseTo(42.5, 1);
    expect(status!.percentUsed).toBeCloseTo(42.5, 1);
    expect(status!.isOverBudget).toBe(false);
    expect(status!.remaining).toBeCloseTo(57.5, 1);
  });

  it("flags over-budget correctly", () => {
    const projectPath = "/kerf-test-nonexistent-xz9q/project2";
    manager.setBudget(projectPath, 10, "daily");
    const now = new Date().toISOString();
    manager.recordUsage(projectPath, "s1", 5000, 2000, 15.0, now);
    const status = manager.checkBudget(projectPath);
    expect(status!.isOverBudget).toBe(true);
    expect(status!.percentUsed).toBe(150);
  });
});

describe("listProjects", () => {
  it("lists all projects with budgets", () => {
    manager.setBudget("/project-a", 50, "weekly");
    manager.setBudget("/project-b", 100, "monthly");
    const projects = manager.listProjects();
    expect(projects.length).toBe(2);
    expect(projects.map((p) => p.name)).toContain("project-a");
    expect(projects.map((p) => p.name)).toContain("project-b");
  });
});

describe("removeBudget", () => {
  it("removes an existing budget", () => {
    manager.setBudget("/test/project", 50, "weekly");
    expect(manager.removeBudget("/test/project")).toBe(true);
    expect(manager.getBudget("/test/project")).toBeNull();
  });

  it("returns false for non-existent budget", () => {
    expect(manager.removeBudget("/nonexistent")).toBe(false);
  });
});
