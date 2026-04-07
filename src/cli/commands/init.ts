import { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import { installHooks } from "../../hooks/installer.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Set up kerf-cli for the current project")
    .option("--global", "Install hooks globally")
    .option("--hooks-only", "Only install hooks")
    .option("--no-hooks", "Skip hook installation")
    .option("--force", "Skip confirmation prompts")
    .option("--enforce-budgets", "Install PreToolUse hook that BLOCKS Claude Code when over budget")
    .action(async (opts) => {
      console.log(chalk.bold.cyan("\n  Welcome to kerf-cli!\n"));
      console.log("  Setting up cost intelligence for Claude Code...\n");

      // Create ~/.kerf/ directory
      const kerfDir = join(homedir(), ".kerf");
      if (!existsSync(kerfDir)) {
        mkdirSync(kerfDir, { recursive: true });
        console.log(chalk.green("  Created ~/.kerf/"));
      }

      if (!opts.hooksOnly) {
        try {
          const db = initDatabase();
          runMigrations(db);
          db.close();
          console.log(chalk.green("  Created ~/.kerf/kerf.db"));
        } catch (err) {
          console.log(chalk.red(`  Failed to create database: ${err}`));
        }
      }

      // Detect existing tools
      try {
        const { execSync } = await import("node:child_process");
        try {
          execSync("which rtk", { stdio: "ignore" });
          console.log(chalk.green("  Detected RTK (command compression) -- kerf will show combined savings!"));
        } catch {
          console.log(chalk.dim("  Tip: Install RTK for 60-90% bash compression (brew install rtk-ai/tap/rtk)"));
        }
        try {
          execSync("which ccusage", { stdio: "ignore" });
          console.log(chalk.green("  Detected ccusage -- will import historical data"));
        } catch { /* not installed */ }
      } catch { /* ignore */ }

      // Install hooks
      if (opts.hooks !== false) {
        console.log("\n  Install hooks? These enable:");
        console.log("    - Real-time token tracking (Notification hook)");
        console.log("    - Budget enforcement (Stop hook)");
        console.log(`\n  Hooks will be added to ${opts.global ? "~/.claude" : ".claude"}/settings.json`);

        try {
          const result = installHooks({ global: opts.global, force: opts.force, enforceBudgets: opts.enforceBudgets });
          for (const hook of result.installed) {
            console.log(chalk.green(`  Installed ${hook} hook`));
          }
          for (const hook of result.skipped) {
            console.log(chalk.dim(`  Skipped ${hook}`));
          }
        } catch (err) {
          console.log(chalk.yellow(`\n  Skipped hook installation: ${err}`));
        }
      }

      console.log(chalk.bold("\n  Recommended settings for your setup:"));
      console.log(chalk.dim('  Add to .claude/settings.json or ~/.claude/settings.json:'));
      console.log(chalk.dim(JSON.stringify({
        env: {
          MAX_THINKING_TOKENS: "10000",
          CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "50",
        },
      }, null, 4).split("\n").map(l => "    " + l).join("\n")));

      console.log(chalk.bold.cyan("\n  Run 'kerf-cli watch' to start the live dashboard!\n"));
    });
}
