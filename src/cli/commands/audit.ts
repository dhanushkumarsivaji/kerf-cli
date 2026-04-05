import { Command } from "commander";
import chalk from "chalk";
import { runFullAudit } from "../../audit/recommendations.js";
import { CONTEXT_WINDOW_SIZE } from "../../core/config.js";

export function registerAuditCommand(program: Command): void {
  program
    .command("audit")
    .description("Ghost token & CLAUDE.md audit")
    .option("--fix", "Auto-apply safe fixes")
    .option("--claude-md-only", "Only audit CLAUDE.md")
    .option("--mcp-only", "Only audit MCP servers")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const result = runFullAudit();

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const gradeColor =
        result.grade === "A" ? chalk.green :
        result.grade === "B" ? chalk.yellow :
        chalk.red;

      console.log(chalk.bold.cyan("\n  kerf-cli audit report\n"));
      console.log(
        `  Context Window Health: ${gradeColor.bold(result.grade)} (${result.contextOverhead.percentUsable.toFixed(0)}% usable)\n`,
      );

      if (!opts.mcpOnly) {
        console.log(chalk.bold("  Ghost Token Breakdown:"));
        const oh = result.contextOverhead;
        const fmt = (label: string, tokens: number) => {
          const pct = ((tokens / CONTEXT_WINDOW_SIZE) * 100).toFixed(1);
          return `    ${label.padEnd(22)} ${tokens.toLocaleString().padStart(6)} tokens (${pct}%)`;
        };
        console.log(fmt("System prompt:", oh.systemPrompt));
        console.log(fmt("Built-in tools:", oh.builtInTools));
        console.log(fmt(`MCP tools (${result.mcpServers.length} srv):`, oh.mcpTools));
        console.log(fmt("CLAUDE.md:", oh.claudeMd));
        console.log(fmt("Autocompact buffer:", oh.autocompactBuffer));
        console.log("    " + "-".repeat(40));
        console.log(fmt("Total overhead:", oh.totalOverhead));
        console.log(
          `    ${"Effective window:".padEnd(22)} ${oh.effectiveWindow.toLocaleString().padStart(6)} tokens (${oh.percentUsable.toFixed(1)}%)\n`,
        );
      }

      if (!opts.mcpOnly && result.claudeMdAnalysis) {
        const cma = result.claudeMdAnalysis;
        console.log(chalk.bold("  CLAUDE.md Analysis:"));
        console.log(
          `    Lines: ${cma.totalLines}${cma.isOverLineLimit ? chalk.yellow(" (over 200 limit)") : ""}`,
        );
        console.log(`    Tokens: ${cma.totalTokens.toLocaleString()}`);
        console.log(
          `    Critical rules in dead zone: ${cma.criticalRulesInDeadZone > 0 ? chalk.red(String(cma.criticalRulesInDeadZone)) : "0"}`,
        );
        console.log();
      }

      if (result.recommendations.length > 0) {
        console.log(chalk.bold("  Recommendations:"));
        result.recommendations.forEach((rec, i) => {
          const priorityColor =
            rec.priority === "high" ? chalk.red :
            rec.priority === "medium" ? chalk.yellow :
            chalk.dim;
          console.log(
            `    ${i + 1}. ${priorityColor(`[${rec.priority.toUpperCase()}]`)} ${rec.action}`,
          );
          console.log(chalk.dim(`       Impact: ${rec.impact}`));
        });
      }
      console.log();

      if (opts.fix) {
        console.log(chalk.yellow("  --fix: Auto-fix is not yet implemented. Coming in v0.2.0.\n"));
      }
    });
}
