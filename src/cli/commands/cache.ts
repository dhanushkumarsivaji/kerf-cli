import { Command } from "commander";
import chalk from "chalk";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import { IngestService } from "../../core/ingest.js";
import { computeCacheStats, detectPoorCacheSessions } from "../../core/cacheReporter.js";

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function registerCacheCommand(program: Command): void {
  program
    .command("cache")
    .description("Cache hit-rate report and savings analysis")
    .option("--period <period>", "today | week | month | all", "month")
    .option("--project <path>", "Filter to a specific project path")
    .option("--poor-sessions", "List sessions with poor cache utilization")
    .option("--json", "Machine-readable JSON output")
    .action(async (opts) => {
      const db = initDatabase();
      runMigrations(db);
      const ingest = new IngestService(db);
      try {
        await ingest.ingestAll();
      } catch {
        // non-fatal
      }

      try {
        const stats = computeCacheStats(db, opts.period, opts.project);
        const poor = opts.poorSessions ? detectPoorCacheSessions(db) : [];

        if (opts.json) {
          console.log(JSON.stringify({ stats, poorSessions: poor }, null, 2));
          return;
        }

        const hitPct = stats.cacheHitRate * 100;
        const hitColor =
          hitPct >= 70 ? chalk.green : hitPct >= 40 ? chalk.yellow : chalk.red;

        console.log(chalk.bold.cyan(`\n  kerf cache report  (${opts.period})\n`));
        console.log(
          `  Cache hit rate: ${hitColor.bold(hitPct.toFixed(1) + "%")}  ${chalk.dim(
            `(${fmtTokens(stats.totalCacheReadTokens)} read / ${fmtTokens(
              stats.totalInputTokens + stats.totalCacheReadTokens,
            )} cacheable)`,
          )}\n`,
        );

        console.log(chalk.bold("  Tokens:"));
        console.log(`    Input (uncached):    ${fmtTokens(stats.totalInputTokens).padStart(8)}`);
        console.log(`    Cache reads:         ${fmtTokens(stats.totalCacheReadTokens).padStart(8)}`);
        console.log(
          `    Cache creation:      ${fmtTokens(stats.totalCacheCreationTokens).padStart(8)}\n`,
        );

        console.log(chalk.bold("  Cost (sonnet pricing approx):"));
        console.log(`    Cache read cost:     ${fmt(stats.cacheCostUsd).padStart(9)}`);
        console.log(`    Non-cached input:    ${fmt(stats.nonCachedCostUsd).padStart(9)}`);
        console.log(
          `    ${chalk.green("Saved by cache:")}      ${chalk.green(
            fmt(stats.savingsFromCache).padStart(9),
          )}`,
        );
        console.log(
          `    ${chalk.yellow("Could still save:")}    ${chalk.yellow(
            fmt(stats.potentialAdditionalSavings).padStart(9),
          )} ${chalk.dim("(at 80% hit rate)")}\n`,
        );

        if (opts.poorSessions && poor.length > 0) {
          console.log(chalk.bold("  Sessions with poor cache utilization:"));
          for (const s of poor) {
            console.log(
              `    ${chalk.red((s.cacheHitRate * 100).toFixed(0) + "%").padStart(5)}  ${fmt(
                s.totalCostUsd,
              ).padStart(8)}  ${chalk.yellow("save " + fmt(s.potentialSavings))}  ${chalk.dim(
                s.sessionId.slice(0, 8),
              )}  ${chalk.dim(s.projectPath)}`,
            );
          }
          console.log();
        } else if (opts.poorSessions) {
          console.log(chalk.dim("  No sessions with poor cache utilization detected.\n"));
        }
      } finally {
        db.close();
      }
    });
}
