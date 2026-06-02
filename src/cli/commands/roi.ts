import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "node:child_process";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import { IngestService } from "../../core/ingest.js";

type Period = "week" | "month" | "all";

function sinceFor(period: Period): string | null {
  const d = new Date();
  if (period === "week") d.setDate(d.getDate() - 7);
  else if (period === "month") d.setDate(d.getDate() - 30);
  else return null;
  return d.toISOString().slice(0, 10);
}

/** Count commits (and merge commits) in the repo since a date. Returns null if not a git repo. */
function gitCounts(cwd: string, since: string | null): { commits: number; merges: number } | null {
  const sinceArg = since ? `--since=${since}` : "";
  try {
    const commits = parseInt(
      execSync(`git rev-list --count HEAD ${sinceArg}`, {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim(),
      10,
    );
    const merges = parseInt(
      execSync(`git rev-list --count --merges HEAD ${sinceArg}`, {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim(),
      10,
    );
    return { commits: Number.isFinite(commits) ? commits : 0, merges: Number.isFinite(merges) ? merges : 0 };
  } catch {
    return null;
  }
}

export function registerRoiCommand(program: Command): void {
  program
    .command("roi")
    .description("Exploratory: AI spend vs delivery (commits / merges) for this repo")
    .option("--period <period>", "week | month | all", "month")
    .option("--project <path>", "Project path (default: current directory)")
    .option("--json", "Machine-readable JSON output")
    .option("--no-sync", "Skip syncing local logs first")
    .action(async (opts) => {
      const period = opts.period as Period;
      if (!["week", "month", "all"].includes(period)) {
        console.error(chalk.red(`Invalid period: ${period}. Use week|month|all.`));
        process.exit(1);
      }
      const cwd = process.cwd();
      const project = opts.project ?? cwd;
      const since = sinceFor(period);

      const db = initDatabase();
      runMigrations(db);
      try {
        if (opts.sync !== false) {
          try {
            await new IngestService(db).ingestAll();
          } catch {
            /* non-fatal */
          }
        }

        const where = ["project_path = ?"];
        const params: unknown[] = [project];
        if (since) {
          where.push("timestamp >= ?");
          params.push(since);
        }
        const row = db
          .prepare(`SELECT COALESCE(SUM(cost_usd), 0) as cost FROM messages WHERE ${where.join(" AND ")}`)
          .get(...params) as { cost: number };
        const cost = row.cost;

        const counts = gitCounts(cwd, since);

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                period,
                project,
                spentUsd: cost,
                commits: counts?.commits ?? null,
                merges: counts?.merges ?? null,
                costPerCommit: counts && counts.commits > 0 ? cost / counts.commits : null,
                costPerMerge: counts && counts.merges > 0 ? cost / counts.merges : null,
              },
              null,
              2,
            ),
          );
          return;
        }

        console.log(chalk.bold.cyan(`\n  kerf roi — ${period}\n`));
        console.log(`  Spent:    ${chalk.green("$" + cost.toFixed(2))}`);
        if (!counts) {
          console.log(chalk.dim("  (not a git repository — can't correlate with delivery)"));
          console.log();
          return;
        }
        console.log(`  Commits:  ${counts.commits}`);
        console.log(`  Merges:   ${counts.merges}`);
        if (counts.commits > 0) {
          console.log(`  ${chalk.dim("Cost / commit:")} ${chalk.white("$" + (cost / counts.commits).toFixed(2))}`);
        }
        if (counts.merges > 0) {
          console.log(`  ${chalk.dim("Cost / merge: ")} ${chalk.white("$" + (cost / counts.merges).toFixed(2))}`);
        }
        console.log(chalk.dim("\n  Exploratory: commits/merges are a rough delivery proxy.\n"));
      } finally {
        db.close();
      }
    });
}
