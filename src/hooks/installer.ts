import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// Embedded hook templates (avoids runtime file path issues after tsup bundling)
const NOTIFICATION_HOOK = `#!/bin/bash
# kerf-cli notification hook
KERF_LOG="\${HOME}/.kerf/session-log.jsonl"
mkdir -p "\$(dirname "\$KERF_LOG")"
INPUT=\$(cat)
# Validate JSON before embedding to prevent log corruption
if ! echo "\$INPUT" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  if ! echo "\$INPUT" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null; then
    exit 0
  fi
fi
TIMESTAMP=\$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION_ID=\$(echo "\$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"//')
echo "{\\"timestamp\\":\\"\$TIMESTAMP\\",\\"session_id\\":\\"\$SESSION_ID\\",\\"event\\":\\"notification\\",\\"raw\\":\$INPUT}" >> "\$KERF_LOG"
`;

const STOP_HOOK = `#!/bin/bash
# kerf-cli stop hook — budget enforcement
KERF_BIN=\$(which kerf-cli 2>/dev/null || echo "npx kerf-cli@latest")
BUDGET_CHECK=\$(\$KERF_BIN budget show --json 2>/dev/null)
if [ \$? -ne 0 ] || [ -z "\$BUDGET_CHECK" ]; then
  exit 0
fi
PERCENT_USED=\$(echo "\$BUDGET_CHECK" | grep -o '"percentUsed"[[:space:]]*:[[:space:]]*[0-9.]*' | head -1 | sed 's/.*: *//')
IS_OVER=\$(echo "\$BUDGET_CHECK" | grep -o '"isOverBudget"[[:space:]]*:[[:space:]]*\\(true\\|false\\)' | head -1 | sed 's/.*: *//')
if [ "\$IS_OVER" = "true" ]; then
  echo '{"reason":"Budget exceeded. Run kerf-cli budget show for details."}'
  exit 0
fi
if [ -n "\$PERCENT_USED" ]; then
  THRESHOLD=80
  OVER=\$(echo "\$PERCENT_USED > \$THRESHOLD" | bc -l 2>/dev/null || echo "0")
  if [ "\$OVER" = "1" ]; then
    echo "{\\"reason\\":\\"Budget warning: \$PERCENT_USED% used. Run kerf-cli budget show for details.\\"}"
  fi
fi
exit 0
`;

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

  const installed: string[] = [];
  const skipped: string[] = [];

  // Write hook scripts to ~/.kerf/hooks/
  const hooksDir = join(homedir(), ".kerf", "hooks");
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  const notificationPath = join(hooksDir, "notification.sh");
  const stopPath = join(hooksDir, "stop.sh");

  writeFileSync(notificationPath, NOTIFICATION_HOOK, { mode: 0o755 });
  writeFileSync(stopPath, STOP_HOOK, { mode: 0o755 });

  // Notification hook
  if (!hasKerfHook(settings.hooks, "Notification")) {
    addHook(settings.hooks, "Notification", notificationPath);
    installed.push("Notification");
  } else {
    skipped.push("Notification (already installed)");
  }

  // Stop hook
  if (!hasKerfHook(settings.hooks, "Stop")) {
    addHook(settings.hooks, "Stop", stopPath);
    installed.push("Stop");
  } else {
    skipped.push("Stop (already installed)");
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return { installed, skipped, settingsPath };
}

function hasKerfHook(hooks: Record<string, HookConfig[]>, event: string): boolean {
  const eventHooks = hooks[event] ?? [];
  return eventHooks.some((h) => h.hooks.some((hh) => hh.command.includes("kerf")));
}

function addHook(hooks: Record<string, HookConfig[]>, event: string, scriptPath: string): void {
  if (!hooks[event]) {
    hooks[event] = [];
  }
  hooks[event].push({
    matcher: "",
    hooks: [{ type: "command", command: `bash ${scriptPath}` }],
  });
}
