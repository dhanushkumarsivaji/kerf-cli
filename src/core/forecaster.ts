import type Database from "better-sqlite3";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek.js";

dayjs.extend(isoWeek);

export interface Forecast {
  period: "week" | "month";
  spentSoFar: number;
  projectedTotal: number;
  projectedRemaining: number;
  dailyRunRate: number;
  /** % above (+) or below (-) the user's usual spend for this period. */
  vsTypical: number;
  confidence: "low" | "medium" | "high";
}

const DATE_FMT = "YYYY-MM-DD";

interface DailyRow {
  total_cost_usd: number;
}

/** Sum daily_summaries cost over an inclusive [start, end] date range. */
function sumRange(db: Database.Database, start: string, end: string): number {
  const row = db
    .prepare(
      `SELECT SUM(total_cost_usd) as total FROM daily_summaries
       WHERE date >= ? AND date <= ?`,
    )
    .get(start, end) as { total: number | null };
  return row.total ?? 0;
}

/** Coefficient of variation (stddev / mean) of the daily costs in a range. */
function coefficientOfVariation(db: Database.Database, start: string, end: string): number {
  const rows = db
    .prepare(
      `SELECT total_cost_usd FROM daily_summaries WHERE date >= ? AND date <= ?`,
    )
    .all(start, end) as DailyRow[];
  if (rows.length < 2) return 0;
  const values = rows.map((r) => r.total_cost_usd);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Project total spend for the current week/month based on run-rate, comparing
 * against the user's typical spend over prior periods.
 *
 * `now` is injectable for deterministic testing; defaults to the current time.
 */
export function forecastSpend(
  db: Database.Database,
  period: "week" | "month",
  now: dayjs.Dayjs = dayjs(),
): Forecast {
  const start = period === "week" ? now.startOf("isoWeek") : now.startOf("month");
  const totalDaysInPeriod = period === "week" ? 7 : now.daysInMonth();
  const daysElapsed = now.diff(start, "day") + 1;

  const startStr = start.format(DATE_FMT);
  const todayStr = now.format(DATE_FMT);

  const spentSoFar = sumRange(db, startStr, todayStr);
  const dailyRunRate = daysElapsed > 0 ? spentSoFar / daysElapsed : 0;
  const projectedTotal = dailyRunRate * totalDaysInPeriod;
  const projectedRemaining = Math.max(0, projectedTotal - spentSoFar);

  // Typical = average total over the prior 4 comparable periods that had spend.
  const PRIOR_PERIODS = 4;
  const priorTotals: number[] = [];
  for (let k = 1; k <= PRIOR_PERIODS; k++) {
    const priorStart =
      period === "week" ? start.subtract(k, "week") : start.subtract(k, "month");
    const priorEnd =
      period === "week"
        ? priorStart.add(6, "day")
        : priorStart.endOf("month");
    const total = sumRange(db, priorStart.format(DATE_FMT), priorEnd.format(DATE_FMT));
    if (total > 0) priorTotals.push(total);
  }
  const typical =
    priorTotals.length > 0
      ? priorTotals.reduce((a, b) => a + b, 0) / priorTotals.length
      : 0;
  const vsTypical = typical > 0 ? ((projectedTotal - typical) / typical) * 100 : 0;

  // Confidence grows with elapsed days and shrinks with day-to-day variance.
  const elapsedFraction = daysElapsed / totalDaysInPeriod;
  const cv = coefficientOfVariation(db, startStr, todayStr);
  let confidence: Forecast["confidence"];
  if (elapsedFraction >= 0.6) confidence = "high";
  else if (elapsedFraction >= 0.3) confidence = "medium";
  else confidence = "low";
  // High variance drops confidence by one notch.
  if (cv > 1.0 && confidence === "high") confidence = "medium";
  else if (cv > 1.0 && confidence === "medium") confidence = "low";

  return {
    period,
    spentSoFar,
    projectedTotal,
    projectedRemaining,
    dailyRunRate,
    vsTypical,
    confidence,
  };
}
