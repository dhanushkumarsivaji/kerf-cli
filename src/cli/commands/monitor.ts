import { Command } from "commander";
import chalk from "chalk";
import { getActiveSessions } from "../../core/parser.js";
import { detectAnomalies } from "../../core/anomalyDetector.js";
import { AlertDispatcher } from "../../core/alerts.js";
import { loadAlertConfig } from "../../core/config.js";
import type { AlertChannel } from "../../core/alerts.js";

/** Sessions touched within this window are considered "active" and worth checking. */
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

export function registerMonitorCommand(program: Command): void {
  program
    .command("monitor")
    .description("Background watcher that alerts on cost anomalies in real time")
    .option("--webhook <url>", "Slack/Discord/generic webhook for alerts")
    .option("--severity <level>", "Minimum severity: warning|critical")
    .option("-i, --interval <ms>", "Poll interval in ms", "3000")
    .option("--once", "Run a single check and exit (useful for testing/cron)")
    .action(async (opts) => {
      const severity = opts.severity as "warning" | "critical" | undefined;
      if (severity && severity !== "warning" && severity !== "critical") {
        console.error(chalk.red(`Invalid severity: ${severity}. Use warning|critical.`));
        process.exit(1);
      }

      // Persisted config is the base; CLI flags override it for this run.
      const base = loadAlertConfig();
      const channels: AlertChannel[] = [...base.channels];
      if (opts.webhook && !channels.includes("webhook")) channels.push("webhook");

      const config = {
        ...base,
        channels,
        minSeverity: severity ?? base.minSeverity,
        webhookUrl: opts.webhook ?? base.webhookUrl,
      };
      const dispatcher = new AlertDispatcher(config);

      const interval = parseInt(opts.interval, 10);
      // Track which anomalies we've already alerted on so we never repeat.
      const seen = new Set<string>();

      const tick = async (): Promise<void> => {
        let sessions;
        try {
          sessions = await getActiveSessions();
        } catch {
          return; // transient FS error — try again next tick
        }
        const now = Date.now();
        const recent = sessions.filter(
          (s) => now - s.lastModified.getTime() < ACTIVE_WINDOW_MS,
        );

        for (const session of recent) {
          const report = detectAnomalies(session.messages);
          for (const anomaly of report.anomalies) {
            const key = `${session.sessionId}:${anomaly.messageId}:${anomaly.type}`;
            if (seen.has(key)) continue;
            seen.add(key);
            await dispatcher.dispatch(anomaly);

            const icon = anomaly.severity === "critical" ? "🔴" : "🟡";
            const color = anomaly.severity === "critical" ? chalk.red : chalk.yellow;
            console.log(
              color(`${icon} [${session.sessionId.slice(0, 8)}] ${anomaly.description}`) +
                chalk.dim(`\n   → ${anomaly.recommendation}`),
            );
          }
        }
      };

      if (opts.once) {
        await tick();
        return;
      }

      console.log(
        chalk.bold("kerf monitor") +
          chalk.dim(" — watching for cost anomalies. Ctrl+C to stop."),
      );
      const timer = setInterval(() => {
        void tick();
      }, interval);
      // Keep the process alive but allow clean Ctrl+C.
      process.on("SIGINT", () => {
        clearInterval(timer);
        console.log(chalk.dim("\nkerf monitor stopped."));
        process.exit(0);
      });
      await tick(); // run once immediately
    });
}
