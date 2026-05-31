import { Command } from "commander";
import chalk from "chalk";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import { IngestService } from "../../core/ingest.js";
import {
  analyzeModelDistribution,
  detectExpensiveSessions,
} from "../../core/efficiencyAnalyzer.js";
import { analyzeCrossTool } from "../../core/crossToolAnalyzer.js";

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function registerEfficiencyCommand(program: Command): void {
  program
    .command("efficiency")
    .description("Analyze model usage efficiency and estimate savings")
    .option("--period <period>", "today | week | month | all", "month")
    .option("--project <path>", "Filter to a specific project path")
    .option("--tool <tool>", "Filter to a specific tool (claude-code, codex, …)")
    .option("--expensive-sessions", "List the most expensive sessions")
    .option("--cross-tool", "Show cross-tool / cross-model optimization recommendations")
    .option("--json", "Machine-readable JSON output")
    .action(async (opts) => {
      const db = initDatabase();
      runMigrations(db);
      const ingest = new IngestService(db);
      try {
        await ingest.ingestAll();
      } catch {
        // non-fatal: continue with whatever data exists
      }

      try {
        const report = analyzeModelDistribution(db, opts.period, opts.project, opts.tool);
        const expensive = opts.expensiveSessions ? detectExpensiveSessions(db) : [];

        // Show cross-tool recs when explicitly requested or when >1 model has data.
        const showCrossTool = opts.crossTool || report.byModel.length > 1;
        const crossToolRecs = showCrossTool ? analyzeCrossTool(db) : [];

        if (opts.json) {
          console.log(
            JSON.stringify(
              { report, expensiveSessions: expensive, crossToolRecommendations: crossToolRecs },
              null,
              2,
            ),
          );
          return;
        }

        const periodLabel = opts.period as string;
        console.log(chalk.bold.cyan(`\n  kerf efficiency report  (${periodLabel})\n`));

        const sonnetSaved = report.estimatedSavings.switchOpusToSonnet;
        const headlineColor =
          sonnetSaved.savedUsd > 50
            ? chalk.bold.green
            : sonnetSaved.savedUsd > 5
              ? chalk.bold.yellow
              : chalk.dim;
        console.log(
          `  ${headlineColor("Estimated savings:")} ${chalk.bold.green(fmt(sonnetSaved.savedUsd))} ${chalk.dim(
            `(${sonnetSaved.percentSaved.toFixed(1)}% of spend)`,
          )}`,
        );
        console.log(
          chalk.dim(`  if Opus traffic were routed to Sonnet for this ${periodLabel}.\n`),
        );

        console.log(chalk.bold(`  Total spend: ${chalk.white(fmt(report.totalCostUsd))}\n`));

        console.log(chalk.bold("  Model breakdown:"));
        for (const m of report.byModel) {
          const color =
            m.model === "opus"
              ? chalk.red
              : m.model === "sonnet"
                ? chalk.cyan
                : m.model === "haiku"
                  ? chalk.green
                  : chalk.dim;
          const bar = "#".repeat(Math.max(1, Math.round(m.percentOfTotal / 3)));
          console.log(
            `    ${color(m.model.padEnd(8))} ${fmt(m.costUsd).padStart(9)} ${chalk.dim(
              `(${m.percentOfTotal.toFixed(1)}% — ${m.messageCount} msgs, ${m.sessionCount} sessions)`,
            )} ${color(bar)}`,
          );
        }
        console.log();

        if (report.opusOverusePercent > 0) {
          const opusColor =
            report.opusOverusePercent > 40
              ? chalk.red
              : report.opusOverusePercent > 20
                ? chalk.yellow
                : chalk.green;
          console.log(
            `  Opus share: ${opusColor.bold(report.opusOverusePercent.toFixed(1) + "%")}`,
          );
        }

        const haikuSaved = report.estimatedSavings.switchOpusToHaiku;
        if (haikuSaved.savedUsd > 0) {
          console.log(
            `  ${chalk.dim("Simple Opus -> Haiku could save:")} ${chalk.green(
              fmt(haikuSaved.savedUsd),
            )} ${chalk.dim(`(${haikuSaved.percentSaved.toFixed(1)}%)`)}`,
          );
        }
        console.log();

        if (crossToolRecs.length > 0) {
          console.log(chalk.bold("  Cross-tool optimization:"));
          for (const rec of crossToolRecs.slice(0, 5)) {
            console.log(
              `    ${chalk.green(fmt(rec.estimatedMonthlySavings) + "/mo")}  ${chalk.white(rec.description)}`,
            );
            console.log(`      ${chalk.dim(rec.evidence)}`);
          }
          console.log();
        }

        if (opts.expensiveSessions && expensive.length > 0) {
          console.log(chalk.bold("  Most expensive sessions:"));
          for (const s of expensive.slice(0, 10)) {
            const tag = s.looksSimple ? chalk.yellow(" [looks simple]") : "";
            console.log(
              `    ${chalk.white(fmt(s.totalCostUsd).padStart(8))}  ${chalk.dim(
                s.sessionId.slice(0, 8),
              )}  ${s.messageCount} msgs  ${chalk.dim(s.projectPath)}${tag}`,
            );
          }
          console.log();
        }
      } finally {
        db.close();
      }
    });
}
