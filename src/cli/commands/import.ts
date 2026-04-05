import { Command } from "commander";
import chalk from "chalk";
import dayjs from "dayjs";
import { findJsonlFilesSync, parseSessionFile } from "../../core/parser.js";
import { calculateMessageCost, formatCost } from "../../core/costCalculator.js";
import { BudgetManager } from "../../core/budgetManager.js";

export function registerImportCommand(program: Command): void {
  program
    .command("import")
    .description("Import historical session data into budget tracking")
    .option("--project <path>", "Import for this project", process.cwd())
    .option("--since <date>", "Only import after this date (YYYY-MM-DD)")
    .option("--dry-run", "Show what would be imported without writing")
    .action((opts) => {
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
