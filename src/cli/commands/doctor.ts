import { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, readdirSync, accessSync, constants, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import dayjs from "dayjs";
import { initDatabase } from "../../db/schema.js";
import { runMigrations } from "../../db/migrations.js";
import {
  KERF_DB_PATH,
  CLAUDE_PROJECTS_DIR,
  CLAUDE_SETTINGS_GLOBAL,
} from "../../core/config.js";

type Status = "ok" | "fail" | "warn";

interface Check {
  name: string;
  status: Status;
  message: string;
  fix?: string;
}

const CLAUDE_DIR = join(homedir(), ".claude");
const KERF_DIR = join(homedir(), ".kerf");
const KERF_HOOKS_DIR = join(KERF_DIR, "hooks");
const LATEST_MIGRATION = 3;

function jsonlExists(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    const stack = [dir];
    let depth = 0;
    while (stack.length && depth < 200) {
      const cur = stack.pop()!;
      const entries = readdirSync(cur, { withFileTypes: true });
      for (const e of entries) {
        const p = join(cur, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.isFile() && e.name.endsWith(".jsonl")) return true;
      }
      depth++;
    }
  } catch {
    return false;
  }
  return false;
}

function runChecks(): Check[] {
  const checks: Check[] = [];

  // 1. Claude Code installed
  if (existsSync(CLAUDE_DIR)) {
    checks.push({ name: "Claude Code installed", status: "ok", message: CLAUDE_DIR });
  } else {
    checks.push({
      name: "Claude Code installed",
      status: "fail",
      message: `${CLAUDE_DIR} not found`,
      fix: "Install Claude Code: https://docs.anthropic.com/claude/docs/claude-code",
    });
  }

  // 2. Projects dir with JSONL files
  if (existsSync(CLAUDE_PROJECTS_DIR) && jsonlExists(CLAUDE_PROJECTS_DIR)) {
    checks.push({
      name: "Claude projects directory has session logs",
      status: "ok",
      message: CLAUDE_PROJECTS_DIR,
    });
  } else {
    checks.push({
      name: "Claude projects directory has session logs",
      status: "fail",
      message: `No JSONL files in ${CLAUDE_PROJECTS_DIR}`,
      fix: "Run a Claude Code session, then re-run kerf doctor",
    });
  }

  // 3. kerf.db exists and writable
  if (existsSync(KERF_DB_PATH)) {
    try {
      accessSync(KERF_DB_PATH, constants.W_OK);
      checks.push({
        name: "kerf database exists and is writable",
        status: "ok",
        message: KERF_DB_PATH,
      });
    } catch {
      checks.push({
        name: "kerf database exists and is writable",
        status: "fail",
        message: `${KERF_DB_PATH} not writable`,
        fix: `chmod u+w ${KERF_DB_PATH}`,
      });
    }
  } else {
    checks.push({
      name: "kerf database exists and is writable",
      status: "fail",
      message: `${KERF_DB_PATH} not found`,
      fix: "kerf init",
    });
  }

  // 4. Schema at latest migration version
  let db: ReturnType<typeof initDatabase> | null = null;
  try {
    db = initDatabase();
    runMigrations(db);
    const row = db
      .prepare("SELECT MAX(version) as v FROM schema_migrations")
      .get() as { v: number | null };
    const v = row.v ?? 0;
    if (v >= LATEST_MIGRATION) {
      checks.push({
        name: "Database schema up to date",
        status: "ok",
        message: `migration v${v}`,
      });
    } else {
      checks.push({
        name: "Database schema up to date",
        status: "fail",
        message: `at v${v}, expected v${LATEST_MIGRATION}`,
        fix: "kerf sync",
      });
    }
  } catch (err) {
    checks.push({
      name: "Database schema up to date",
      status: "fail",
      message: `Failed to query schema: ${(err as Error).message}`,
      fix: "kerf init",
    });
  }

  // 5. Hooks installed in ~/.claude/settings.json
  if (existsSync(CLAUDE_SETTINGS_GLOBAL)) {
    try {
      const raw = readFileSync(CLAUDE_SETTINGS_GLOBAL, "utf-8");
      const parsed = JSON.parse(raw) as {
        hooks?: { Notification?: unknown[]; Stop?: unknown[] };
      };
      const hooksStr = JSON.stringify(parsed.hooks ?? {});
      if (hooksStr.includes("kerf")) {
        checks.push({
          name: "kerf hooks registered in Claude settings",
          status: "ok",
          message: "found in hooks.Notification / hooks.Stop",
        });
      } else {
        checks.push({
          name: "kerf hooks registered in Claude settings",
          status: "warn",
          message: "no kerf hooks found",
          fix: "kerf init --install-hooks",
        });
      }
    } catch (err) {
      checks.push({
        name: "kerf hooks registered in Claude settings",
        status: "warn",
        message: `Could not parse settings.json: ${(err as Error).message}`,
        fix: "Repair ~/.claude/settings.json",
      });
    }
  } else {
    checks.push({
      name: "kerf hooks registered in Claude settings",
      status: "warn",
      message: `${CLAUDE_SETTINGS_GLOBAL} not found`,
      fix: "kerf init --install-hooks",
    });
  }

  // 6. Hook scripts at ~/.kerf/hooks/
  if (existsSync(KERF_HOOKS_DIR)) {
    try {
      const files = readdirSync(KERF_HOOKS_DIR);
      if (files.length > 0) {
        checks.push({
          name: "kerf hook scripts installed",
          status: "ok",
          message: `${files.length} script(s) in ${KERF_HOOKS_DIR}`,
        });
      } else {
        checks.push({
          name: "kerf hook scripts installed",
          status: "warn",
          message: "directory empty",
          fix: "kerf init --install-hooks",
        });
      }
    } catch {
      checks.push({
        name: "kerf hook scripts installed",
        status: "warn",
        message: "could not read hooks directory",
        fix: "kerf init --install-hooks",
      });
    }
  } else {
    checks.push({
      name: "kerf hook scripts installed",
      status: "warn",
      message: `${KERF_HOOKS_DIR} not found`,
      fix: "kerf init --install-hooks",
    });
  }

  // 7. Last sync ran recently
  if (db) {
    try {
      const row = db
        .prepare("SELECT MAX(last_ingested_at) as last FROM ingest_state")
        .get() as { last: string | null };
      if (row.last) {
        const last = dayjs(row.last);
        const hoursAgo = dayjs().diff(last, "hour", true);
        if (hoursAgo > 24) {
          checks.push({
            name: "Recent sync",
            status: "warn",
            message: `last sync ${hoursAgo.toFixed(1)}h ago`,
            fix: "kerf sync",
          });
        } else {
          checks.push({
            name: "Recent sync",
            status: "ok",
            message: `last sync ${hoursAgo.toFixed(1)}h ago`,
          });
        }
      } else {
        checks.push({
          name: "Recent sync",
          status: "warn",
          message: "never synced",
          fix: "kerf sync",
        });
      }
    } catch {
      checks.push({
        name: "Recent sync",
        status: "warn",
        message: "could not query ingest_state",
        fix: "kerf sync",
      });
    }
  }

  // 8. ANTHROPIC_API_KEY in env
  if (process.env.ANTHROPIC_API_KEY) {
    checks.push({
      name: "ANTHROPIC_API_KEY privacy",
      status: "warn",
      message: "ANTHROPIC_API_KEY is set in your environment",
      fix: "Unset if you don't need it: unset ANTHROPIC_API_KEY",
    });
  } else {
    checks.push({
      name: "ANTHROPIC_API_KEY privacy",
      status: "ok",
      message: "not exposed in env",
    });
  }

  // 9. Any session in last 24h > $50
  if (db) {
    try {
      const row = db
        .prepare(
          `SELECT session_id, total_cost_usd FROM sessions_meta
           WHERE last_message_at >= datetime('now', '-1 day')
           ORDER BY total_cost_usd DESC LIMIT 1`,
        )
        .get() as { session_id: string; total_cost_usd: number } | undefined;
      if (row && row.total_cost_usd > 50) {
        checks.push({
          name: "Billing surprise check",
          status: "warn",
          message: `Session ${row.session_id.slice(0, 8)} cost $${row.total_cost_usd.toFixed(2)} in last 24h`,
          fix: "kerf efficiency --expensive-sessions",
        });
      } else {
        checks.push({
          name: "Billing surprise check",
          status: "ok",
          message: "no >$50 sessions in last 24h",
        });
      }
    } catch {
      // ignore
    }
  }

  // 10. Budgets configured
  if (db) {
    try {
      const row = db
        .prepare("SELECT COUNT(*) as c FROM budgets")
        .get() as { c: number };
      if (row.c === 0) {
        checks.push({
          name: "Budgets configured",
          status: "warn",
          message: "no budgets set",
          fix: "kerf budget set --amount <USD> --period monthly",
        });
      } else {
        checks.push({
          name: "Budgets configured",
          status: "ok",
          message: `${row.c} budget(s) configured`,
        });
      }
    } catch {
      checks.push({
        name: "Budgets configured",
        status: "warn",
        message: "budgets table not found",
        fix: "kerf init",
      });
    }
  }

  // db file size sanity touchpoint (avoid unused-import warning)
  if (existsSync(KERF_DB_PATH)) {
    try {
      statSync(KERF_DB_PATH);
    } catch {
      // ignore
    }
  }

  if (db) db.close();
  return checks;
}

function symbolFor(s: Status): string {
  if (s === "ok") return chalk.green("[OK]");
  if (s === "fail") return chalk.red("[FAIL]");
  return chalk.yellow("[WARN]");
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Diagnose kerf installation and Claude Code integration")
    .option("--json", "Machine-readable JSON output")
    .action((opts) => {
      const checks = runChecks();

      if (opts.json) {
        console.log(JSON.stringify({ checks }, null, 2));
        return;
      }

      console.log(chalk.bold.cyan("\n  kerf doctor\n"));
      for (const c of checks) {
        console.log(`  ${symbolFor(c.status)} ${chalk.bold(c.name)}`);
        console.log(`        ${chalk.dim(c.message)}`);
        if (c.fix && c.status !== "ok") {
          console.log(`        ${chalk.cyan("Fix:")} ${c.fix}`);
        }
      }

      const failed = checks.filter((c) => c.status === "fail").length;
      const warned = checks.filter((c) => c.status === "warn").length;
      const passed = checks.filter((c) => c.status === "ok").length;
      console.log();
      console.log(
        `  ${chalk.green(passed + " passed")}  ${chalk.yellow(warned + " warnings")}  ${chalk.red(
          failed + " failed",
        )}\n`,
      );
      if (failed > 0) process.exitCode = 1;
    });
}
