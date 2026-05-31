import { exec } from "node:child_process";
import { platform } from "node:os";
import type { TokenAnomaly } from "./anomalyDetector.js";

export type AlertChannel = "terminal" | "desktop" | "webhook";

export interface AlertConfig {
  /** Where alerts are delivered. */
  channels: AlertChannel[];
  /** Only fire for these severities. Default: 'critical'. */
  minSeverity: "warning" | "critical";
  /** Optional webhook URL (Slack/Discord/generic JSON). */
  webhookUrl?: string;
  /** Debounce: don't re-alert the same anomaly type within N seconds. */
  debounceSeconds: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  channels: ["terminal", "desktop"],
  minSeverity: "critical",
  debounceSeconds: 120,
};

/** Escape a string for safe interpolation into a single-quoted osascript arg. */
function escapeForOsascript(s: string): string {
  // Inside an osascript double-quoted string, escape backslashes then quotes.
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Escape a string for safe interpolation into a double-quoted shell arg. */
function escapeForShell(s: string): string {
  return s.replace(/(["\\$`])/g, "\\$1");
}

/** Fire a desktop notification cross-platform (best-effort, never throws). */
export function desktopNotify(title: string, body: string): void {
  const p = platform();
  try {
    if (p === "darwin") {
      const safeBody = escapeForOsascript(body);
      const safeTitle = escapeForOsascript(title);
      exec(`osascript -e 'display notification "${safeBody}" with title "${safeTitle}"'`);
    } else if (p === "linux") {
      exec(`notify-send "${escapeForShell(title)}" "${escapeForShell(body)}"`);
    } else if (p === "win32") {
      const safeBody = escapeForShell(body);
      const safeTitle = escapeForShell(title);
      const ps = `powershell -Command "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('${safeBody}','${safeTitle}')"`;
      exec(ps);
    }
  } catch {
    // notifications are best-effort; never block or throw
  }
}

/** Post to a webhook (Slack/Discord/generic JSON). Best-effort, 3s timeout. */
export async function webhookNotify(url: string, anomaly: TokenAnomaly): Promise<void> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `kerf alert [${anomaly.severity}]: ${anomaly.description}\nRecommendation: ${anomaly.recommendation}`,
      }),
      signal: controller.signal,
    });
    clearTimeout(t);
  } catch {
    // best-effort: a failing webhook must never crash the monitor
  }
}

export class AlertDispatcher {
  private lastFired = new Map<string, number>();

  constructor(private config: AlertConfig = DEFAULT_ALERT_CONFIG) {}

  private shouldFire(anomaly: TokenAnomaly): boolean {
    if (this.config.minSeverity === "critical" && anomaly.severity !== "critical") {
      return false;
    }
    const key = anomaly.type;
    const now = Date.now();
    const last = this.lastFired.get(key) ?? 0;
    if (now - last < this.config.debounceSeconds * 1000) return false;
    this.lastFired.set(key, now);
    return true;
  }

  async dispatch(anomaly: TokenAnomaly): Promise<void> {
    if (!this.shouldFire(anomaly)) return;

    const title = `kerf: ${anomaly.severity === "critical" ? "🔴" : "🟡"} ${anomaly.type}`;
    const body = anomaly.description;

    for (const channel of this.config.channels) {
      if (channel === "terminal") {
        // Caller (watch/monitor loop) handles terminal rendering; emit a bell.
        process.stdout.write("\x07");
      } else if (channel === "desktop") {
        desktopNotify(title, `${body} — ${anomaly.recommendation}`);
      } else if (channel === "webhook" && this.config.webhookUrl) {
        await webhookNotify(this.config.webhookUrl, anomaly);
      }
    }
  }
}
