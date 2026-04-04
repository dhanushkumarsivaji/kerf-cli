import { homedir } from "node:os";
import { join } from "node:path";
import type { KerfConfig } from "../types/config.js";

export const DEFAULT_CONFIG: KerfConfig = {
  defaultModel: "sonnet",
  budgetWarningThreshold: 80,
  budgetBlockThreshold: 100,
  pollingInterval: 2000,
  dataDir: join(homedir(), ".kerf"),
  enableHooks: true,
};

export const CONTEXT_WINDOW_SIZE = 200_000;
export const SYSTEM_PROMPT_TOKENS = 14_328;
export const BUILT_IN_TOOLS_TOKENS = 15_000;
export const AUTOCOMPACT_BUFFER_TOKENS = 33_000;
export const MCP_TOKENS_PER_TOOL = 600;
export const BILLING_WINDOW_HOURS = 5;

export const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
export const CLAUDE_SETTINGS_GLOBAL = join(homedir(), ".claude", "settings.json");
export const KERF_DB_PATH = join(homedir(), ".kerf", "kerf.db");
export const KERF_SESSION_LOG = join(homedir(), ".kerf", "session-log.jsonl");

export function getConfig(): KerfConfig {
  return { ...DEFAULT_CONFIG };
}
