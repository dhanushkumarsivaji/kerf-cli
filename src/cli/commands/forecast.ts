import { Command } from "commander";
import chalk from "chalk";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import { IngestService } from "../../core/ingest.js";
import { forecastSpend } from "../../core/forecaster.js";

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function registerForecastCommand(program: Command): void {
  program
    .command("forecast")
    .description("Project your spend for the current week or month based on run-rate")
    .option("--period <period>", "week | month", "month")
    .option("--no-sync", "Skip auto-sync before forecasting")
    .option("--json", "Machine-readable JSON output")
    .action(async (opts) => {
      const period = opts.period as "week" | "month";
      if (period !== "week" && period !== "month") {
        console.error(chalk.red(`Invalid period: ${period}. Use week|month.`));
        process.exit(1);
      }

      const db = initDatabase();
      runMigrations(db);
      try {
        if (opts.sync !== false) {
          try {
            await new IngestService(db).ingestAll();
          } catch {
            // non-fatal: continue with whatever data exists
          }
        }

        const forecast = forecastSpend(db, period);

        if (opts.json) {
          console.log(JSON.stringify(forecast, null, 2));
          return;
        }

        console.log(chalk.bold.cyan(`\n  kerf forecast — this ${period}\n`));
        console.log(`  Spent so far:    ${chalk.green(fmt(forecast.spentSoFar))}`);
        console.log(
          `  Daily run-rate:  ${chalk.white(fmt(forecast.dailyRunRate))}${chalk.dim("/day")}`,
        );
        console.log(
          `  Projected total: ${chalk.bold.white(fmt(forecast.projectedTotal))} ${chalk.dim(
            `(${fmt(forecast.projectedRemaining)} remaining)`,
          )}`,
        );

        if (forecast.vsTypical !== 0) {
          const up = forecast.vsTypical > 0;
          const arrow = up ? "↑" : "↓";
          const color = up ? chalk.yellow : chalk.green;
          console.log(
            `  vs. your usual:  ${color(
              `${arrow} ${Math.abs(forecast.vsTypical).toFixed(0)}% ${up ? "above" : "below"}`,
            )}`,
          );
        }

        console.log(chalk.dim(`  Confidence:      ${forecast.confidence}`));
        console.log();
      } finally {
        db.close();
      }
    });
}
