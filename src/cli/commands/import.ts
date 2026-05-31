import { Command } from "commander";
import chalk from "chalk";
import dayjs from "dayjs";
import { findJsonlFilesSync, parseSessionFile } from "../../core/parser.js";
import { calculateMessageCost, formatCost } from "../../core/costCalculator.js";
import { BudgetManager } from "../../core/budgetManager.js";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import { IngestService } from "../../core/ingest.js";
import {
  loadExternalSessions,
  parseExternalAdditions,
  EXTERNAL_ADDITIONS_PATH,
} from "../../adapters/external.js";
import { readFileSync } from "node:fs";

export function registerImportCommand(program: Command): void {
  program
    .command("import")
    .description("Import historical session data into budget tracking")
    .option("--project <path>", "Import for this project", process.cwd())
    .option("--since <date>", "Only import after this date (YYYY-MM-DD)")
    .option(
      "--external [path]",
      `Import external-additions JSON into analytics (default: ${EXTERNAL_ADDITIONS_PATH})`,
    )
    .option("--dry-run", "Show what would be imported without writing")
    .action((opts) => {
      if (opts.external !== undefined) {
        importExternal(opts);
        return;
      }
      const manager = opts.dryRun ? null : new BudgetManager();
      const files = findJsonlFilesSync();
      const since = opts.since ? dayjs(opts.since) : null;

      let totalSessions = 0;
      let totalMessages = 0;
      let totalCost = 0;

      for (const file of files) {
        try {
          const session = parseSessionFile(file);
          let sessionMessages = 0;
          let sessionCost = 0;

          for (const msg of session.messages) {
            if (since && dayjs(msg.timestamp).isBefore(since)) continue;
            const cost = calculateMessageCost(msg);
            if (manager) {
              try {
                manager.recordUsage(opts.project, session.sessionId, msg.usage.input_tokens, msg.usage.output_tokens, cost.totalCost, msg.timestamp);
                sessionMessages++;
                sessionCost += cost.totalCost;
              } catch { /* Already imported */ }
            } else {
              sessionMessages++;
              sessionCost += cost.totalCost;
            }
          }

          if (sessionMessages > 0) {
            totalSessions++;
            totalMessages += sessionMessages;
            totalCost += sessionCost;
          }
        } catch { continue; }
      }

      console.log(chalk.bold.cyan("\n  kerf-cli import\n"));
      if (opts.dryRun) console.log(chalk.yellow("  (dry run — no data written)\n"));
      console.log("  Sessions processed: " + totalSessions);
      console.log("  Messages imported:  " + totalMessages);
      console.log("  Total cost:         " + formatCost(totalCost));
      if (!opts.dryRun) {
        console.log(chalk.green("\n  Data imported to ~/.kerf/kerf.db"));
        console.log(chalk.dim("  Run 'kerf report' to see historical costs.\n"));
      } else {
        console.log();
      }
      manager?.close();
    });
}

function importExternal(opts: { external: string | boolean; dryRun?: boolean }): void {
  const path = typeof opts.external === "string" ? opts.external : EXTERNAL_ADDITIONS_PATH;

  console.log(chalk.bold.cyan("\n  kerf-cli import --external\n"));

  if (opts.dryRun) {
    let sessions;
    try {
      sessions = parseExternalAdditions(JSON.parse(readFileSync(path, "utf-8")), path);
    } catch (err) {
      console.error(chalk.red(`  Failed to read ${path}:`));
      console.error("  " + (err as Error).message);
      process.exit(1);
    }
    const msgs = sessions.reduce((n, s) => n + s.session.messages.length, 0);
    console.log(chalk.yellow("  (dry run — no data written)\n"));
    console.log("  Source:             " + path);
    console.log("  Sessions found:     " + sessions.length);
    console.log("  Messages found:     " + msgs);
    console.log();
    return;
  }

  const sessions = loadExternalSessions(path);
  if (sessions.length === 0) {
    console.log(chalk.yellow(`  No importable sessions found in ${path}.`));
    console.log(chalk.dim("  See the external-additions schema in the README.\n"));
    return;
  }

  const db = initDatabase();
  runMigrations(db);
  try {
    const ingest = new IngestService(db);
    const { files, newMessages } = ingest.ingestBulkSessions(sessions);
    ingest.recomputeDailySummaries();
    const tools = [...new Set(sessions.map((s) => s.tool))].join(", ");
    console.log(chalk.green(`  Imported ${files} sessions, ${newMessages} new messages.`));
    console.log(chalk.dim(`  Tools: ${tools}`));
    console.log(chalk.dim("  Run 'kerf summary --by-tool' to see the breakdown.\n"));
  } finally {
    db.close();
  }
}
