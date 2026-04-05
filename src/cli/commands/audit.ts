import { Command } from "commander";
import chalk from "chalk";
import { copyFileSync, writeFileSync } from "node:fs";
import { runFullAudit } from "../../audit/recommendations.js";
import { findClaudeMdPath, reorderClaudeMd } from "../../audit/claudeMdLinter.js";
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

      // Ghost token breakdown — show unless --claude-md-only
      if (!opts.claudeMdOnly) {
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

      // CLAUDE.md analysis — show unless --mcp-only
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

        if (opts.claudeMdOnly) {
          // Show per-section breakdown when claude-md-only
          console.log();
          console.log(chalk.bold("  Sections:"));
          for (const section of cma.sections) {
            const zone = section.attentionZone === "low-middle" ? chalk.red(" [dead zone]") : chalk.green(" [high attention]");
            const critical = section.hasCriticalRules ? chalk.yellow(" *critical rules*") : "";
            console.log(
              `    ${section.title.padEnd(30)} ${String(section.tokens).padStart(5)} tokens  L${section.lineStart}-${section.lineEnd}${zone}${critical}`,
            );
          }

          if (cma.suggestedReorder.length > 0) {
            console.log();
            console.log(chalk.bold("  Suggested section order:"));
            cma.suggestedReorder.forEach((title, i) => {
              console.log(`    ${i + 1}. ${title}`);
            });
          }
        }
        console.log();
      } else if (!opts.mcpOnly && !result.claudeMdAnalysis) {
        console.log(chalk.yellow("  No CLAUDE.md found in current directory or git root.\n"));
      }

      // MCP details — show when --mcp-only
      if (opts.mcpOnly && result.mcpServers.length > 0) {
        console.log(chalk.bold("  MCP Servers:"));
        for (const server of result.mcpServers) {
          const heavy = server.isHeavy ? chalk.red(" [heavy]") : "";
          console.log(
            `    ${server.name.padEnd(20)} ${String(server.toolCount).padStart(3)} tools  ${server.estimatedTokens.toLocaleString().padStart(6)} tokens${heavy}`,
          );
        }
        console.log();
      } else if (opts.mcpOnly && result.mcpServers.length === 0) {
        console.log(chalk.dim("  No MCP servers configured.\n"));
      }

      // Recommendations — always show
      if (result.recommendations.length > 0) {
        const filteredRecs = opts.claudeMdOnly
          ? result.recommendations.filter((r) => r.category === "claude-md")
          : opts.mcpOnly
            ? result.recommendations.filter((r) => r.category === "mcp")
            : result.recommendations;

        if (filteredRecs.length > 0) {
          console.log(chalk.bold("  Recommendations:"));
          filteredRecs.forEach((rec, i) => {
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
      }
      console.log();

      if (opts.fix) {
        const fixes: string[] = [];

        if (result.claudeMdAnalysis && result.claudeMdAnalysis.criticalRulesInDeadZone > 0) {
          const claudeMdPath = findClaudeMdPath();
          if (claudeMdPath) {
            const { reordered, changes } = reorderClaudeMd(claudeMdPath);
            const backupPath = claudeMdPath + ".kerf-backup";
            copyFileSync(claudeMdPath, backupPath);
            writeFileSync(claudeMdPath, reordered);
            fixes.push(...changes);
            console.log(chalk.green("  Backup saved to " + backupPath));
          }
        }

        if (fixes.length > 0) {
          console.log(chalk.green.bold("\n  Applied fixes:"));
          fixes.forEach(f => console.log(chalk.green("    - " + f)));
        } else {
          console.log(chalk.dim("\n  No auto-fixable issues found."));
        }
        console.log();
      }
    });
}
