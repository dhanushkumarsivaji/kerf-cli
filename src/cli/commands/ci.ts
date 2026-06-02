import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "node:child_process";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import { IngestService } from "../../core/ingest.js";
import {
  computeCiCost,
  renderCiMarkdown,
  type CiCostResult,
} from "../../core/ciReporter.js";

/** Resolve the branch to attribute to: CI env vars first, then local git. */
export function detectBranch(cwd: string): string | null {
  const env =
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    process.env.CI_COMMIT_REF_NAME ||
    process.env.BRANCH_NAME;
  if (env) return env;
  try {
    const out = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return out && out !== "HEAD" ? out : null;
  } catch {
    return null;
  }
}

interface CommonOpts {
  branch?: string;
  project?: string;
  anyProject?: boolean;
  since?: string;
  sync?: boolean;
}

function resolve(opts: CommonOpts): { branch: string | null; project: string | null; since: string | null } {
  const cwd = process.cwd();
  const branch = opts.branch ?? detectBranch(cwd);
  const project = opts.anyProject ? null : (opts.project ?? cwd);
  return { branch, project, since: opts.since ?? null };
}

export function registerCiCommand(program: Command): void {
  const ci = program
    .command("ci")
    .description("CI/CD helpers: attribute AI cost to the current branch/PR (reads the local kerf DB)");

  ci
    .command("report")
    .description("Report AI cost attributable to the current branch (JSON or Markdown)")
    .option("--branch <name>", "Branch to attribute to (default: auto-detected)")
    .option("--project <path>", "Project path filter (default: current directory)")
    .option("--any-project", "Do not filter by project")
    .option("--since <iso_date>", "Only count usage at/after this date")
    .option("--format <fmt>", "markdown | json", "markdown")
    .option("--no-sync", "Skip syncing local logs before reporting")
    .action(async (opts) => {
      const { branch, project, since } = resolve(opts);
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
        const result = computeCiCost(db, { branch, project, since });
        if (opts.format === "json") {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(renderCiMarkdown(result));
        }
      } finally {
        db.close();
      }
    });

  ci
    .command("gate")
    .description("Fail (exit 1) if the branch's AI cost exceeds a threshold")
    .requiredOption("--max <usd>", "Maximum allowed cost in USD")
    .option("--branch <name>", "Branch to attribute to (default: auto-detected)")
    .option("--project <path>", "Project path filter (default: current directory)")
    .option("--any-project", "Do not filter by project")
    .option("--since <iso_date>", "Only count usage at/after this date")
    .option("--no-sync", "Skip syncing local logs before checking")
    .action(async (opts) => {
      const max = parseFloat(opts.max);
      if (!Number.isFinite(max) || max < 0) {
        console.error(chalk.red(`--max must be a non-negative number, got: ${opts.max}`));
        process.exit(2);
      }
      const { branch, project, since } = resolve(opts);
      const db = initDatabase();
      runMigrations(db);
      let result: CiCostResult;
      try {
        if (opts.sync !== false) {
          try {
            await new IngestService(db).ingestAll();
          } catch {
            /* non-fatal */
          }
        }
        result = computeCiCost(db, { branch, project, since });
      } finally {
        db.close();
      }

      const label = branch ? `branch '${branch}'` : "current scope";
      if (result.totalCostUsd > max) {
        console.error(
          chalk.red(
            `✗ AI cost for ${label} is $${result.totalCostUsd.toFixed(2)}, over the $${max.toFixed(2)} limit.`,
          ),
        );
        process.exit(1);
      }
      console.log(
        chalk.green(
          `✓ AI cost for ${label} is $${result.totalCostUsd.toFixed(2)}, within the $${max.toFixed(2)} limit.`,
        ),
      );
    });
}
