import { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Set up kerf for the current project")
    .option("--global", "Install hooks globally")
    .option("--hooks-only", "Only install hooks")
    .option("--no-hooks", "Skip hook installation")
    .option("--force", "Skip confirmation prompts")
    .action(async (opts) => {
      console.log(chalk.bold.cyan("\n  Welcome to kerf!\n"));
      console.log("  Setting up cost intelligence for Claude Code...\n");

      // Create ~/.kerf/ directory
      const kerfDir = join(homedir(), ".kerf");
      if (!existsSync(kerfDir)) {
        mkdirSync(kerfDir, { recursive: true });
        console.log(chalk.green("  Created ~/.kerf/"));
      }

      if (!opts.hooksOnly) {
        // Initialize database
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
          console.log(chalk.green("  Detected RTK (command compression) -- compatible!"));
        } catch { /* not installed */ }

        try {
          execSync("which ccusage", { stdio: "ignore" });
          console.log(chalk.green("  Detected ccusage -- will import historical data"));
        } catch { /* not installed */ }
      } catch { /* ignore */ }

      // Install hooks
      if (opts.hooks !== false) {
        const settingsPath = opts.global
          ? join(homedir(), ".claude", "settings.json")
          : join(process.cwd(), ".claude", "settings.json");

        console.log("\n  Install hooks? These enable:");
        console.log("    - Real-time token tracking (Notification hook)");
        console.log("    - Budget enforcement (Stop hook)");
        console.log(`\n  Hooks will be added to ${opts.global ? "~/.claude" : ".claude"}/settings.json`);

        try {
          installHooks(settingsPath);
          console.log(chalk.green("\n  Hooks installed"));
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

      console.log(chalk.bold.cyan("\n  Run 'kerf watch' to start the live dashboard!\n"));
    });
}

function installHooks(settingsPath: string): void {
  const dir = dirname(settingsPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    // Backup existing settings
    const backupPath = settingsPath + ".bak";
    copyFileSync(settingsPath, backupPath);
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;

  // Add Notification hook if not present
  if (!hooks.Notification) {
    hooks.Notification = [];
  }

  // Add Stop hook if not present
  if (!hooks.Stop) {
    hooks.Stop = [];
  }

  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
