import { Command } from "commander";
import chalk from "chalk";
import { BudgetManager } from "../../core/budgetManager.js";
import { formatCost } from "../../core/costCalculator.js";

export function registerBudgetCommand(program: Command): void {
  const budget = program.command("budget").description("Per-project budget management");

  budget
    .command("set <amount>")
    .description("Set budget for current project")
    .option("-p, --period <period>", "Budget period (daily|weekly|monthly)", "weekly")
    .option("--project <path>", "Project path")
    .action((amount: string, opts) => {
      const manager = new BudgetManager();
      const projectPath = opts.project || process.cwd();
      const amountNum = parseFloat(amount);

      if (isNaN(amountNum) || amountNum <= 0) {
        console.log(chalk.red("Budget amount must be a positive number."));
        process.exit(1);
      }

      manager.setBudget(projectPath, amountNum, opts.period);
      console.log(
        chalk.green(`Budget set: ${formatCost(amountNum)}/${opts.period} for ${projectPath}`),
      );
      manager.close();
    });

  budget
    .command("show")
    .description("Show current project budget")
    .option("--project <path>", "Project path")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const manager = new BudgetManager();
      const projectPath = opts.project || process.cwd();
      const status = manager.checkBudget(projectPath);

      if (!status) {
        console.log("No budget set for this project. Use 'kerf-cli budget set <amount>' to set one.");
        manager.close();
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(status, null, 2));
        manager.close();
        return;
      }

      const pct = status.percentUsed;
      const barWidth = 20;
      const filled = Math.round((Math.min(pct, 100) / 100) * barWidth);
      const empty = barWidth - filled;
      const color = pct < 50 ? "green" : pct < 80 ? "yellow" : "red";
      const barColor = color === "green" ? chalk.green : color === "yellow" ? chalk.yellow : chalk.red;

      console.log(chalk.bold.cyan("\n  kerf-cli budget\n"));
      console.log(`  Period:  ${status.period} (${status.periodStart.slice(0, 10)} to ${status.periodEnd.slice(0, 10)})`);
      console.log(`  Budget:  ${formatCost(status.budget)}`);
      console.log(`  Spent:   ${barColor(formatCost(status.spent))}`);
      console.log(`  ${barColor("[" + "\u2588".repeat(filled) + "\u2591".repeat(empty) + "]")} ${pct.toFixed(1)}%`);

      if (status.isOverBudget) {
        console.log(chalk.red.bold(`\n  OVER BUDGET by ${formatCost(status.spent - status.budget)}`));
      }
      console.log();

      manager.close();
    });

  budget
    .command("list")
    .description("List all project budgets")
    .action(() => {
      const manager = new BudgetManager();
      const projects = manager.listProjects();

      if (projects.length === 0) {
        console.log("No projects with budgets. Use 'kerf-cli budget set <amount>' to set one.");
        manager.close();
        return;
      }

      console.log(chalk.bold.cyan("\n  kerf-cli budget list\n"));
      for (const p of projects) {
        const budgetStr = p.budget ? `${formatCost(p.budget)}/${p.period}` : "no budget";
        const spentStr = p.spent > 0 ? ` (spent: ${formatCost(p.spent)})` : "";
        console.log(`  ${chalk.bold(p.name)} — ${budgetStr}${spentStr}`);
        console.log(chalk.dim(`    ${p.path}`));
      }
      console.log();

      manager.close();
    });

  budget
    .command("remove")
    .description("Remove budget for current project")
    .option("--project <path>", "Project path")
    .action((opts) => {
      const manager = new BudgetManager();
      const projectPath = opts.project || process.cwd();
      const removed = manager.removeBudget(projectPath);

      if (removed) {
        console.log(chalk.green("Budget removed."));
      } else {
        console.log("No budget found for this project.");
      }

      manager.close();
    });

  budget
    .command("check")
    .description("Check budget (for use in PreToolUse hook). Exits 2 if over budget.")
    .option("--project <path>", "Project path")
    .option("--json", "JSON output")
    .action((opts) => {
      const manager = new BudgetManager();
      const projectPath = opts.project || process.cwd();
      const status = manager.checkBudget(projectPath);

      if (!status) {
        // No budget configured — silent pass
        manager.close();
        process.exit(0);
      }

      if (opts.json) {
        console.log(JSON.stringify(status));
        manager.close();
        process.exit(status.isOverBudget ? 2 : 0);
      }

      if (status.isOverBudget) {
        const reason = `Kerf budget exceeded: ${formatCost(status.spent)} of ${formatCost(status.budget)} (${status.percentUsed.toFixed(0)}%). Run \`kerf budget show\` for details.`;
        process.stderr.write(JSON.stringify({ reason, decision: "block" }) + "\n");
        manager.close();
        process.exit(2);
      }

      if (status.percentUsed >= 80) {
        const reason = `Kerf budget warning: ${formatCost(status.spent)} of ${formatCost(status.budget)} (${status.percentUsed.toFixed(0)}%).`;
        process.stderr.write(JSON.stringify({ reason }) + "\n");
      }

      manager.close();
      process.exit(0);
    });
}
