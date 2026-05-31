import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import { IngestService } from "../../core/ingest.js";
import { getAdapters, getAllAdapterIds } from "../../adapters/registry.js";
import type { ToolId } from "../../adapters/types.js";

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Ingest AI coding agent sessions into kerf's SQLite analytics database")
    .option("--tool <tool>", "Only sync a specific tool (claude-code, codex, …)")
    .option("--json", "Machine-readable JSON output")
    .action(async (opts) => {
      let filter: ToolId[] | undefined;
      if (opts.tool) {
        const valid = getAllAdapterIds();
        if (!valid.includes(opts.tool)) {
          console.error(
            chalk.red(`Unknown tool: ${opts.tool}. Known tools: ${valid.join(", ")}`),
          );
          process.exit(1);
        }
        filter = [opts.tool as ToolId];
      }

      const db = initDatabase();
      runMigrations(db);
      const ingest = new IngestService(db);

      const adapters = getAdapters(filter);
      const spinner = opts.json ? null : ora("Syncing AI coding agent sessions...").start();

      try {
        const perTool: Array<{
          tool: ToolId;
          displayName: string;
          filesProcessed: number;
          newMessages: number;
        }> = [];

        let totalFiles = 0;
        let totalNew = 0;
        const start = Date.now();

        for (const adapter of adapters) {
          const files = await adapter.discoverSessions();
          const stats = ingest.ingestAdapterFiles(adapter, files);
          perTool.push({
            tool: adapter.id,
            displayName: adapter.displayName,
            filesProcessed: stats.filesProcessed,
            newMessages: stats.newMessages,
          });
          totalFiles += stats.filesProcessed;
          totalNew += stats.newMessages;
        }

        // Recompute daily summaries once after all adapters have ingested.
        ingest.recomputeDailySummaries();
        const durationMs = Date.now() - start;

        if (opts.json) {
          console.log(JSON.stringify({ perTool, totalFiles, totalNew, durationMs }));
        } else {
          if (adapters.length === 0) {
            spinner!.warn(
              chalk.yellow("No supported AI coding tools detected on this machine."),
            );
          } else {
            spinner!.succeed(
              chalk.green(
                `Synced ${totalFiles} files, ${totalNew} new messages in ${(durationMs / 1000).toFixed(1)}s`,
              ),
            );
            for (const t of perTool) {
              console.log(
                `  ${chalk.cyan(t.displayName.padEnd(13))} ${String(t.filesProcessed).padStart(4)} files, ${String(t.newMessages).padStart(6)} new messages`,
              );
            }
          }
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
