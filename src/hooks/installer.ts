import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

interface HookConfig {
  matcher: string;
  hooks: Array<{ type: string; command: string }>;
}

interface SettingsWithHooks {
  hooks?: Record<string, HookConfig[]>;
  [key: string]: unknown;
}

export function installHooks(options: { global?: boolean; force?: boolean } = {}): {
  installed: string[];
  skipped: string[];
  settingsPath: string;
} {
  const settingsPath = options.global
    ? join(homedir(), ".claude", "settings.json")
    : join(process.cwd(), ".claude", "settings.json");

  const dir = dirname(settingsPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let settings: SettingsWithHooks = {};
  if (existsSync(settingsPath)) {
    const backupPath = settingsPath + ".kerf-backup";
    copyFileSync(settingsPath, backupPath);
    settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hookScriptsDir = join(dirname(new URL(import.meta.url).pathname), "templates");
  const installed: string[] = [];
  const skipped: string[] = [];

  // Notification hook
  const notificationScript = join(hookScriptsDir, "notification.sh");
  if (!hasHook(settings.hooks, "Notification", notificationScript)) {
    addHook(settings.hooks, "Notification", notificationScript);
    installed.push("Notification");
  } else {
    skipped.push("Notification (already installed)");
  }

  // Stop hook
  const stopScript = join(hookScriptsDir, "stop.sh");
  if (!hasHook(settings.hooks, "Stop", stopScript)) {
    addHook(settings.hooks, "Stop", stopScript);
    installed.push("Stop");
  } else {
    skipped.push("Stop (already installed)");
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  return { installed, skipped, settingsPath };
}

function hasHook(
  hooks: Record<string, HookConfig[]>,
  event: string,
  command: string,
): boolean {
  const eventHooks = hooks[event] ?? [];
  return eventHooks.some((h) =>
    h.hooks.some((hh) => hh.command.includes("kerf")),
  );
}

function addHook(
  hooks: Record<string, HookConfig[]>,
  event: string,
  scriptPath: string,
): void {
  if (!hooks[event]) {
    hooks[event] = [];
  }
  hooks[event].push({
    matcher: "",
    hooks: [
      {
        type: "command",
        command: `bash ${scriptPath}`,
      },
    ],
  });
}
