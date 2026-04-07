import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import { IngestService } from "../../core/ingest.js";

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Ingest Claude Code session JSONL into kerf's SQLite analytics database")
    .option("--json", "Machine-readable JSON output")
    .action(async (opts) => {
      const db = initDatabase();
      runMigrations(db);
      const ingest = new IngestService(db);

      const spinner = opts.json ? null : ora("Syncing Claude Code sessions...").start();
      try {
        const stats = await ingest.ingestAll();
        if (opts.json) {
          console.log(JSON.stringify(stats));
        } else {
          spinner!.succeed(
            chalk.green(
              `Synced ${stats.filesProcessed} files, ${stats.newMessages} new messages in ${(stats.durationMs / 1000).toFixed(1)}s`,
            ),
          );
        }
      } catch (err) {
        if (spinner) spinner.fail("Sync failed");
        console.error(err);
        process.exit(1);
      } finally {
        db.close();
      }
    });
}
