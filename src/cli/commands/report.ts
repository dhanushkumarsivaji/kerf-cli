import { Command } from "commander";
import chalk from "chalk";
import dayjs from "dayjs";
import { getActiveSessions, parseSessionFile, findJsonlFiles } from "../../core/parser.js";
import {
  calculateMessageCost,
  aggregateCosts,
  formatCost,
  formatTokens,
} from "../../core/costCalculator.js";
import type { ParsedMessage } from "../../types/jsonl.js";

export function registerReportCommand(program: Command): void {
  program
    .command("report")
    .description("Historical cost reports")
    .option("--period <period>", "Time period (today|week|month|all)", "today")
    .option("-p, --project <path>", "Filter to specific project")
    .option("--model", "Show per-model breakdown")
    .option("--sessions", "Show per-session breakdown")
    .option("--csv", "Export as CSV")
    .option("--json", "Export as JSON")
    .action(async (opts) => {
      const files = await findJsonlFiles(opts.project);

      if (files.length === 0) {
        console.log("No session data found. Start using Claude Code to generate data.");
        return;
      }

      // Determine time filter
      const now = dayjs();
      let cutoff: dayjs.Dayjs;
      switch (opts.period) {
        case "today":
          cutoff = now.startOf("day");
          break;
        case "week":
          cutoff = now.subtract(7, "day");
          break;
        case "month":
          cutoff = now.subtract(30, "day");
          break;
        case "all":
          cutoff = dayjs("2000-01-01");
          break;
        default:
          cutoff = now.startOf("day");
      }

      // Parse all sessions and collect messages
      const allMessages: ParsedMessage[] = [];
      const sessionSummaries: Array<{ id: string; model: string; cost: number; messages: number }> = [];

      for (const file of files) {
        try {
          const session = parseSessionFile(file);
          const filteredMessages = session.messages.filter((m) =>
            dayjs(m.timestamp).isAfter(cutoff),
          );
          if (filteredMessages.length === 0) continue;

          allMessages.push(...filteredMessages);

          const sessionCost = filteredMessages.reduce(
            (sum, m) => sum + calculateMessageCost(m).totalCost,
            0,
          );
          sessionSummaries.push({
            id: session.sessionId,
            model: filteredMessages[0]?.model ?? "unknown",
            cost: sessionCost,
            messages: filteredMessages.length,
          });
        } catch {
          continue;
        }
      }

      if (allMessages.length === 0) {
        console.log(`No data found for period: ${opts.period}`);
        return;
      }

      // Calculate totals
      let totalCost = 0;
      let totalInput = 0;
      let totalOutput = 0;
      let totalCacheRead = 0;

      for (const msg of allMessages) {
        totalCost += calculateMessageCost(msg).totalCost;
        totalInput += msg.usage.input_tokens;
        totalOutput += msg.usage.output_tokens;
        totalCacheRead += msg.usage.cache_read_input_tokens;
      }

      const totalCacheable = totalInput + totalCacheRead;
      const cacheHitRate = totalCacheable > 0 ? (totalCacheRead / totalCacheable) * 100 : 0;

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              period: opts.period,
              totalCost,
              totalInput,
              totalOutput,
              cacheHitRate,
              sessions: sessionSummaries,
            },
            null,
            2,
          ),
        );
        return;
      }

      if (opts.csv) {
        console.log("session_id,model,cost_usd,messages");
        for (const s of sessionSummaries) {
          console.log(`${s.id},${s.model},${s.cost.toFixed(4)},${s.messages}`);
        }
        return;
      }

      // Pretty print
      const periodLabel = opts.period === "today" ? now.format("ddd, MMM D, YYYY") : opts.period;
      console.log(chalk.bold.cyan(`\n  kerf-cli report -- ${periodLabel}\n`));
      console.log(`  Total Cost:       ${chalk.bold(formatCost(totalCost))}`);
      console.log(`  Total Tokens:     ${formatTokens(totalInput)} in / ${formatTokens(totalOutput)} out`);
      console.log(`  Cache Hit Rate:   ${cacheHitRate.toFixed(1)}%`);
      console.log(`  Sessions:         ${sessionSummaries.length}`);
      console.log();

      if (opts.model || opts.sessions) {
        // Model breakdown
        const byModel = new Map<string, { cost: number; sessions: number }>();
        for (const s of sessionSummaries) {
          const existing = byModel.get(s.model) ?? { cost: 0, sessions: 0 };
          existing.cost += s.cost;
          existing.sessions++;
          byModel.set(s.model, existing);
        }

        console.log(chalk.bold("  Model Breakdown:"));
        for (const [model, data] of byModel) {
          const pct = totalCost > 0 ? ((data.cost / totalCost) * 100).toFixed(1) : "0";
          const shortModel = model.replace("claude-", "").replace(/-20\d{6}$/, "");
          console.log(
            `    ${shortModel}: ${formatCost(data.cost)} (${pct}%) -- ${data.sessions} session(s)`,
          );
        }
        console.log();
      }

      if (opts.sessions) {
        console.log(chalk.bold("  Session Breakdown:"));
        for (const s of sessionSummaries.sort((a, b) => b.cost - a.cost)) {
          console.log(`    ${s.id.slice(0, 12)}  ${formatCost(s.cost)}  ${s.messages} msgs  [${s.model}]`);
        }
        console.log();
      }

      // Hourly breakdown
      const hourly = aggregateCosts(allMessages, "hour");
      if (hourly.length > 1) {
        console.log(chalk.bold("  Hourly:"));
        const maxCost = Math.max(...hourly.map((h) => h.totalCost));
        for (const h of hourly.slice(-8)) {
          const barLen = maxCost > 0 ? Math.round((h.totalCost / maxCost) * 12) : 0;
          const bar = "\u2588".repeat(barLen) + "\u2591".repeat(12 - barLen);
          console.log(`    ${h.periodLabel.padEnd(14)} ${bar} ${formatCost(h.totalCost)}`);
        }
        console.log();
      }
    });
}
