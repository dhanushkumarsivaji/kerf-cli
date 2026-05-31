import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import dayjs from "dayjs";
import { runMigrations } from "../src/db/migrations.js";
import { forecastSpend } from "../src/core/forecaster.js";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

function seedDay(db: Database.Database, date: string, cost: number): void {
  db.prepare(
    `INSERT OR REPLACE INTO daily_summaries (date, total_cost_usd) VALUES (?, ?)`,
  ).run(date, cost);
}

describe("forecastSpend", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = freshDb();
  });

  afterEach(() => {
    db.close();
  });

  it("projects month total as run-rate x days in month", () => {
    // Pretend "today" is the 10th of a 30-day month (June 2026).
    const now = dayjs("2026-06-10T12:00:00");
    // $5/day for the first 10 days = $50 spent so far.
    for (let d = 1; d <= 10; d++) {
      seedDay(db, `2026-06-${String(d).padStart(2, "0")}`, 5);
    }
    const forecast = forecastSpend(db, "month", now);

    expect(forecast.spentSoFar).toBeCloseTo(50, 5);
    expect(forecast.dailyRunRate).toBeCloseTo(5, 5);
    // June has 30 days → 5 * 30 = 150.
    expect(forecast.projectedTotal).toBeCloseTo(150, 5);
    expect(forecast.projectedRemaining).toBeCloseTo(100, 5);
  });

  it("projects week total as run-rate x 7", () => {
    // ISO week starting Monday 2026-06-01; "today" is Wednesday (day 3).
    const now = dayjs("2026-06-03T12:00:00");
    seedDay(db, "2026-06-01", 4);
    seedDay(db, "2026-06-02", 4);
    seedDay(db, "2026-06-03", 4);
    const forecast = forecastSpend(db, "week", now);

    expect(forecast.spentSoFar).toBeCloseTo(12, 5);
    expect(forecast.dailyRunRate).toBeCloseTo(4, 5);
    expect(forecast.projectedTotal).toBeCloseTo(28, 5); // 4 * 7
  });

  it("computes vsTypical against prior periods", () => {
    const now = dayjs("2026-06-10T12:00:00");
    // Current month: $5/day for 10 days → projects to $150.
    for (let d = 1; d <= 10; d++) {
      seedDay(db, `2026-06-${String(d).padStart(2, "0")}`, 5);
    }
    // Prior month (May 2026): total $100 across the month.
    seedDay(db, "2026-05-15", 100);
    // April 2026: total $100.
    seedDay(db, "2026-04-15", 100);

    const forecast = forecastSpend(db, "month", now);
    // Typical = $100, projected = $150 → +50%.
    expect(forecast.vsTypical).toBeCloseTo(50, 0);
  });

  it("reports low confidence when only 1-2 days have elapsed", () => {
    const now = dayjs("2026-06-02T12:00:00"); // day 2 of the month
    seedDay(db, "2026-06-01", 5);
    seedDay(db, "2026-06-02", 5);
    const forecast = forecastSpend(db, "month", now);
    expect(forecast.confidence).toBe("low");
  });

  it("reports high confidence late in the period", () => {
    const now = dayjs("2026-06-25T12:00:00"); // day 25 of 30
    for (let d = 1; d <= 25; d++) {
      seedDay(db, `2026-06-${String(d).padStart(2, "0")}`, 5);
    }
    const forecast = forecastSpend(db, "month", now);
    expect(forecast.confidence).toBe("high");
  });

  it("returns zeros and no typical comparison with no data", () => {
    const now = dayjs("2026-06-10T12:00:00");
    const forecast = forecastSpend(db, "month", now);
    expect(forecast.spentSoFar).toBe(0);
    expect(forecast.projectedTotal).toBe(0);
    expect(forecast.vsTypical).toBe(0);
  });
});
