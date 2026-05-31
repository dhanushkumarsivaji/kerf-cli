import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { KerfConfig } from "../types/config.js";
import { DEFAULT_ALERT_CONFIG, type AlertConfig } from "./alerts.js";

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
export const KERF_CONFIG_PATH = join(homedir(), ".kerf", "config.json");

export function getConfig(): KerfConfig {
  return { ...DEFAULT_CONFIG };
}

/** Shape of the persisted ~/.kerf/config.json file. All sections optional. */
export interface KerfConfigFile {
  alerts?: Partial<AlertConfig>;
}

/** Read and parse ~/.kerf/config.json. Returns {} if missing or invalid. */
export function loadConfigFile(configPath: string = KERF_CONFIG_PATH): KerfConfigFile {
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as KerfConfigFile) : {};
  } catch {
    return {};
  }
}

/** Persist the config file, creating the data directory if needed. */
export function saveConfigFile(
  config: KerfConfigFile,
  configPath: string = KERF_CONFIG_PATH,
): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Load the effective alert configuration: defaults overlaid with any
 * persisted `alerts` section from ~/.kerf/config.json.
 */
export function loadAlertConfig(configPath: string = KERF_CONFIG_PATH): AlertConfig {
  const file = loadConfigFile(configPath);
  const overrides = file.alerts ?? {};
  return {
    ...DEFAULT_ALERT_CONFIG,
    ...overrides,
    // Never let a persisted empty array silently disable all channels.
    channels:
      overrides.channels && overrides.channels.length > 0
        ? overrides.channels
        : DEFAULT_ALERT_CONFIG.channels,
  };
}
