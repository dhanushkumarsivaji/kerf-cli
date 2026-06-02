# kerf-cli

**Know exactly what you're spending on AI coding — before it surprises you.**

[![npm version](https://img.shields.io/npm/v/kerf-cli)](https://www.npmjs.com/package/kerf-cli)
[![CI](https://github.com/dhanushkumarsivaji/kerf-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/dhanushkumarsivaji/kerf-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-green.svg)]()

![kerf dashboard](docs/assets/dashboard.png)

> Real screenshot from a live machine — `$178.04 spent in the last 7 days, 25 sessions, 98% cache hit rate, 37% of weekly budget used, $141/mo potential savings`.

---

## What is kerf?

If you use **Claude Code**, **Codex CLI**, or other AI coding agents, you're spending real money on every token. kerf is a free, local CLI tool that:

- **Tracks** every AI coding session automatically — no setup beyond a one-time `kerf init`
- **Shows** how much you've spent, by model, by project, by tool, by day
- **Alerts** you the instant a session starts running away (runaway loops, cache drops)
- **Helps you spend less** — finds where you're over-using expensive models and how much you'd save by switching
- **Enforces budgets** — can physically stop Claude Code when you go over a limit

Everything happens **100% on your machine**. No cloud account. No API key required. No data leaves your laptop.

> *kerf (n.) — the width of material removed by a cutting tool. Every token operation has a kerf.*

---

## Who is this for?

- **Developers using Claude Code or Codex CLI** who want to understand and control what they're spending
- **Teams** who want to set budgets and get alerts when someone goes over
- **Anyone** who has ever been surprised by an AI billing statement

You don't need to know SQL. You don't need to understand how tokens work. The defaults just work.

---

## Supported tools

| Tool | Status | Where kerf reads data from |
|------|--------|---------------------------|
| **Claude Code** | ✅ Full support | `~/.claude/projects/**/*.jsonl` |
| **Codex CLI** (incl. Codex Desktop) | ✅ Full support | `~/.codex/sessions/**/rollout-*.jsonl` |
| **Cursor, Copilot, others** | ✅ Via manual export | `~/.kerf/external-additions.json` |
| **Gemini CLI, OpenCode, Qwen** | ✅ Via OpenTelemetry | `~/.kerf/otel-sources.json` |

kerf auto-detects which tools are installed on your machine and ingests them all with a single `kerf sync`.

---

## Install

You need **Node.js 20 or newer**. Check with `node --version`. If you don't have it, download from [nodejs.org](https://nodejs.org) — pick any **LTS** version.

**Install globally (recommended — use `kerf` anywhere):**

```bash
npm install -g kerf-cli
```

**Or run without installing (always uses the latest version):**

```bash
npx kerf-cli@latest <command>
```

After a global install, both `kerf` and `kerf-cli` work as command names:

```bash
kerf summary     # shorter
kerf-cli summary # same thing
```

> **Windows users:** if you see a native-module error about "Visual Studio", you're on a very new Node version without a prebuilt binary. Fix: `nvm use 22` (or install Node 22 LTS from nodejs.org) and reinstall.

---

## Quick start (5 minutes)

```bash
# Step 1 — one-time setup (creates the database, installs usage hooks)
kerf init

# Step 2 — import your sessions into kerf's database
kerf sync

# Step 3 — see what you've spent
kerf summary

# Step 4 — find wasted money
kerf efficiency

# Step 5 — open the visual dashboard
kerf dashboard
```

That's it. From here, `kerf sync` + `kerf summary` is your daily habit. Everything else is when you want to dig deeper.

---

## How does it work?

When you use Claude Code or Codex CLI, they write **session log files** to your home directory. kerf reads those files, calculates the cost of every message, and stores it all in a local SQLite database (`~/.kerf/kerf.db`). That database is just a file on your machine — you own it, you can query it directly, and deleting it resets everything.

```
Claude Code logs          Codex CLI logs           External / OTel
~/.claude/projects/       ~/.codex/sessions/        ~/.kerf/external-additions.json
  session.jsonl             rollout-*.jsonl          ~/.kerf/otel-sources.json
        │                        │                           │
        └────────────────────────┴───────────────────────────┘
                                 │
                           kerf sync
                                 │
                    ~/.kerf/kerf.db  (SQLite)
                                 │
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
     CLI commands          Web dashboard          SQL queries
  (summary, efficiency…)  (kerf dashboard)    (kerf query "…")
```

Because all data is local SQLite, every command responds instantly — even with years of session history.

---

## All commands

### First-time setup

---

#### `kerf init` — set up kerf

Run once after installing. Creates the `~/.kerf/` directory, initialises the database, and optionally installs hooks into Claude Code so kerf automatically logs every session.

```bash
kerf init                    # standard setup (recommended for most people)
kerf init --enforce-budgets  # also add a hard BLOCK when you go over budget
kerf init --global           # install hooks for all projects (not just this one)
kerf init --no-hooks         # only create the database, skip hooks entirely
kerf init --hooks-only       # only install hooks, database already exists
```

**What are hooks?** Hooks are small shell scripts that Claude Code runs automatically. kerf uses three:
- **Notification hook** — logs every Claude Code message to kerf's database in real-time
- **Stop hook** — shows you a warning when you hit 80% or 100% of your budget
- **PreToolUse hook** *(optional, only with `--enforce-budgets`)* — physically blocks Claude Code from making tool calls when you're over budget

---

#### `kerf doctor` — check your setup

Runs 10 checks and tells you if anything is misconfigured, with plain-English fixes.

```bash
kerf doctor         # shows a checklist in the terminal
kerf doctor --json  # same output as JSON (useful for scripts)
```

Example output:
```
[OK]   Claude Code installed: /Users/you/.claude
[OK]   Codex CLI detected
[OK]   Claude projects directory has session logs
[OK]   kerf database exists and is writable
[OK]   Database schema up to date
[WARN] No kerf hooks registered
       Fix: run kerf init
[OK]   kerf hook scripts installed
```

If something is `[FAIL]` or `[WARN]`, the Fix line tells you exactly what to run.

---

#### `kerf sync` — import sessions into the database

Reads all session files from your AI coding tools and imports any new messages into kerf's SQLite database. Incremental — re-running it is safe and only picks up new data.

```bash
kerf sync                  # import everything (Claude Code + Codex + any configured sources)
kerf sync --tool claude-code  # only import Claude Code sessions
kerf sync --tool codex        # only import Codex CLI sessions
kerf sync --json              # show results as JSON
```

After syncing you'll see a breakdown:
```
✔ Synced 285 files, 13,695 new messages in 1.2s
  Claude Code    247 files,  12,491 new messages
  Codex CLI       38 files,   1,204 new messages
```

> Most analytics commands (`summary`, `efficiency`, etc.) auto-sync before running, so you usually don't need to call this manually. Add `--no-sync` to any command to skip it and use whatever's already in the database.

---

### Understanding your spend

---

#### `kerf summary` — how much did I spend?

The command you'll run most often. Shows cost, messages, sessions, and token counts for a time period.

```bash
kerf summary                    # today (default)
kerf summary --period week      # last 7 days
kerf summary --period month     # last 30 days
kerf summary --period all       # all time

# Break it down further
kerf summary --model            # split by model (Opus vs Sonnet vs Haiku)
kerf summary --by-project       # split by project folder
kerf summary --by-tool          # split by tool (Claude Code vs Codex vs …)

# Filter to a specific project or tool
kerf summary --project ~/code/myapp   # only sessions in this folder
kerf summary --tool codex             # only Codex CLI sessions

# Output formats
kerf summary --json     # machine-readable JSON
kerf summary --csv      # spreadsheet-friendly CSV
kerf summary --no-sync  # skip the auto-sync (faster if data is fresh)
```

Example:
```
  kerf summary — today

  Cost:      $26.39
  Messages:  146
  Sessions:  5
  Input:     186
  Output:    107.6K
  Cache rd:  60.9M
  Cache wr:  1.7M
```

**Cross-tool view** with `--by-tool`:
```
  By tool:

  Tool            Cost  Share  Sessions
  -----------  -------  -----  --------
  claude-code  $178.04    63%        25
  codex         $89.12    31%        18
```

**Spend projection:** on `--period week` or `--period month`, kerf appends a one-line forecast of where you'll end up by end of period, based on your current run rate. See `kerf forecast` for the full breakdown.

---

#### `kerf sessions` — list your sessions

Shows individual Claude Code / Codex sessions with their cost, duration, and model. Use this to find which sessions spent the most.

```bash
kerf sessions                       # 20 most recent sessions
kerf sessions --limit 50            # show more
kerf sessions --sort cost           # most expensive first
kerf sessions --sort messages       # most messages first
kerf sessions --sort duration       # longest first
kerf sessions --since 2026-04-01    # only sessions after this date
kerf sessions --project ~/code/app  # only sessions in this folder
kerf sessions --tool codex          # only Codex sessions
kerf sessions --json                # JSON output

kerf sessions abc12345              # drill into a specific session (paste any part of the ID)
```

The list shows a **Tool** column so you can see Claude Code vs Codex at a glance:
```
  When     Tool    Project     Models     Msgs    Cost  Duration  Session
  -------  ------  ----------  ---------  ----  ------  --------  --------
  2h ago   claude  kerf-cli    opus-4-8    387  $38.96    36h 5m  6eb7d6ab
  2mo ago  codex   my-trader   gpt-5.4      22   $0.41        5m  rollout-
```

**Drilling into a session** shows a full timeline — every message with its timestamp, model, token counts, and cost:
```bash
kerf sessions 6eb7d6ab   # paste the ID shown in the list
```

---

#### `kerf report` — historical report with anomalies

A detailed view of a time period, including anomaly detection (unusual spikes in cost or cache drops).

```bash
kerf report                   # today
kerf report --period week     # last 7 days
kerf report --period month    # last 30 days
kerf report --sessions        # include per-session breakdown
kerf report --model           # include per-model breakdown
kerf report --sessions --model  # both
kerf report --json
kerf report --csv
```

Example (anomaly detection built in):
```
  kerf-cli report — today

  Total Cost:       $22.17
  Cache Hit Rate:   98.4%

  Anomalies Detected: 2
    [CRITICAL] Turn cost $0.85 is 6x the session average of $0.14
      → Investigate this turn for unnecessary tool calls or large file reads
    [CRITICAL] Cache ratio dropped from 100% to 7%
      → Cache may have been evicted — consider shorter sessions
```

---

#### `kerf forecast` — where am I headed this month?

Projects your total spend for the current week or month based on how much you've spent so far, compared to your typical spend in prior periods.

```bash
kerf forecast                # project this month's total
kerf forecast --period week  # project this week's total
kerf forecast --json
```

Example:
```
  kerf forecast — this month

  Spent so far:    $86.40
  Daily run-rate:  $8.64/day
  Projected total: $259.20  ($172.80 remaining)
  vs. your usual:  ↑ 18% above
  Confidence:      high
```

**Confidence** is how much of the period has elapsed. After 3+ weeks it's `high`; in the first few days it's `low` — the projection is a rough extrapolation.

> A one-line version of this forecast also appears automatically at the bottom of `kerf summary --period week` and `kerf summary --period month`.

---

#### `kerf efficiency` — am I wasting money on expensive models?

The most actionable command. Tells you how much you'd save if you moved Opus traffic to Sonnet, and which sessions are driving the most cost.

```bash
kerf efficiency                      # last 30 days (default)
kerf efficiency --period week
kerf efficiency --period month
kerf efficiency --period all
kerf efficiency --project ~/code/app   # filter to one project
kerf efficiency --tool codex           # filter to one tool
kerf efficiency --expensive-sessions   # list the 10 most expensive sessions
kerf efficiency --cross-tool           # cross-model + cross-tool optimization tips
kerf efficiency --json
```

Example:
```
  kerf efficiency report  (month)

  Estimated savings: $144.55 (72.0% of spend)
  if Opus traffic were routed to Sonnet for this month.

  Total spend: $200.69

  Model breakdown:
    opus     $180.69  (90.0% — 2569 msgs, 30 sessions) ##############################
    sonnet    $13.22  ( 6.6% — 365 msgs,   3 sessions) ##
    haiku      $6.78  ( 3.4% — 239 msgs,  21 sessions) #
```

**What is `--cross-tool`?** When you use multiple tools (Claude Code + Codex), kerf can identify cases where you're doing similar work on a more expensive tool. It produces ranked recommendations:
```
  Cross-tool optimization:
    $29.31/mo  Routing Opus traffic to Sonnet would save ~$29.31/month
               380 Opus messages across 1 sessions in the last 30 days
```

**Run this weekly.** If your Opus share is over 50%, you're leaving significant money on the table.

---

#### `kerf cache` — is my context caching working?

Claude's prompt caching can reduce costs by up to 90% on repeated context. This command shows how much you're benefiting from it — and how much you're leaving on the table.

```bash
kerf cache                       # last 30 days
kerf cache --period week
kerf cache --period month
kerf cache --period all
kerf cache --project ~/code/app  # filter to one project
kerf cache --tool codex          # filter to one tool
kerf cache --poor-sessions       # list sessions with low cache utilization
kerf cache --json
```

Example:
```
  kerf cache report  (month)

  Cache hit rate: 98.7%  (102.1M read / 102.1M cacheable)

  Tokens:
    Input (uncached):    13.4K
    Cache reads:        102.1M
    Cache creation:       1.3M

  Cost breakdown:
    Cache read cost:    $30.62
    Non-cached input:    $0.04
    Saved by cache:    $275.54   ← money cache saved you
    Could still save:    $0.00   ← additional savings at 80% hit rate
```

A hit rate above 70% is healthy. Below 30%, your sessions are probably starting cold too often — consider keeping sessions alive longer or reducing how often you restart Claude Code.

---

#### `kerf query` — write your own SQL queries

For when you want to ask a question kerf doesn't have a built-in command for. Runs directly against the SQLite database. Completely **read-only** — write operations (INSERT, UPDATE, DELETE, etc.) are rejected.

```bash
kerf query --schema                     # print the full database schema
kerf query --examples                   # show 5 useful example queries

kerf query "SELECT ..."                 # run a query inline
kerf query --file my-query.sql          # run a query from a file
kerf query --json "SELECT ..."          # JSON output
kerf query --csv "SELECT ..."           # CSV output
```

**You don't need to know SQL to use kerf** — all the useful things are already built-in commands. But if you do know SQL, the full database is yours to explore.

Useful queries:

```sql
-- How much have I spent per project, all time?
SELECT project_path, ROUND(SUM(cost_usd), 2) AS cost
FROM messages
GROUP BY project_path
ORDER BY cost DESC
LIMIT 10;

-- Daily spend over the last 30 days
SELECT date(timestamp) AS day, ROUND(SUM(cost_usd), 2) AS cost
FROM messages
WHERE timestamp >= date('now', '-30 days')
GROUP BY day
ORDER BY day DESC;

-- My most expensive sessions
SELECT session_id, project_path, total_cost_usd, message_count
FROM sessions_meta
WHERE total_cost_usd > 5
ORDER BY total_cost_usd DESC;

-- Spend by tool (Claude Code vs Codex vs …)
SELECT tool, ROUND(SUM(cost_usd), 2) AS cost, COUNT(DISTINCT session_id) AS sessions
FROM messages
WHERE timestamp >= date('now', '-30 days')
GROUP BY tool
ORDER BY cost DESC;
```

Every row in the database carries a `tool` column (`claude-code`, `codex`, `cursor`, etc.), so you can filter any query to a specific tool by adding `WHERE tool = 'claude-code'`.

---

### Watching your spend in real time

---

#### `kerf watch` — live terminal dashboard

Opens a real-time dashboard in your terminal that updates every 2 seconds while Claude Code is running. Open this in a second terminal tab alongside your Claude Code session.

```bash
kerf watch                         # auto-finds your active session
kerf watch --session abc123        # watch a specific session by its ID
kerf watch --project ~/code/app    # filter to a specific project
kerf watch --interval 5000         # refresh every 5 seconds instead of 2
kerf watch --alerts                # also fire desktop notifications for anomalies
```

The dashboard shows:
- **Cost meter** — how much you've spent this session and at what rate
- **Context bar** — how full your context window is (helps you know when to start a new session)
- **Cache health** — HEALTHY / DEGRADED / BROKEN with the current hit rate
- **Anomaly alerts** — if a turn costs 5× more than usual or cache suddenly drops
- **Recent messages** — last 8 messages with per-turn cost and cache ratio

Press `q` to quit, `b` to toggle the budget view.

> **Note:** `kerf watch` requires a real terminal (TTY). It won't work piped into another command or in a non-interactive environment.

---

#### `kerf monitor` — background alert watcher

A headless (no UI) process that runs in the background and **alerts you the moment a cost anomaly happens** — even while you're not watching. The key use case: a runaway Claude Code loop that would burn $40/hour while you step away.

```bash
kerf monitor                                # watch all active sessions, alert on critical anomalies
kerf monitor --severity warning             # also alert on warnings (lower threshold)
kerf monitor --webhook https://hooks.slack.com/...  # post alerts to Slack or Discord
kerf monitor --interval 5000               # check every 5 seconds (default: every 3s)
kerf monitor --once                        # check right now and exit (good for cron jobs)
```

Alert channels are configurable in `~/.kerf/config.json`. This persists your settings so you don't have to pass flags every time:

```json
{
  "alerts": {
    "channels": ["terminal", "desktop", "webhook"],
    "minSeverity": "critical",
    "webhookUrl": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    "debounceSeconds": 120
  }
}
```

| Setting | Values | Default | Meaning |
|---------|--------|---------|---------|
| `channels` | `terminal`, `desktop`, `webhook` | `["terminal","desktop"]` | Where alerts go |
| `minSeverity` | `critical`, `warning` | `critical` | Only fire for critical by default |
| `webhookUrl` | any URL | (none) | Slack/Discord/generic JSON webhook |
| `debounceSeconds` | any number | `120` | Don't repeat the same alert for 2 minutes |

Desktop notifications work natively on macOS (via `osascript`), Linux (via `notify-send`), and Windows (PowerShell toast).

To start the monitor automatically when your computer starts, add `kerf monitor` to your system's startup items or use a tool like `pm2`.

---

### Controlling costs

---

#### `kerf budget` — set spending limits

Set a dollar limit per project per time period. kerf will warn you when you approach it, and (optionally) block Claude Code when you hit it.

```bash
# Set a budget for the current project
kerf budget set 50 --period weekly     # $50/week
kerf budget set 10 --period daily      # $10/day
kerf budget set 200 --period monthly   # $200/month

# See your current budget and spend
kerf budget show               # current project
kerf budget show --project ~/code/other-project   # a different project
kerf budget show --json

# List budgets across all projects
kerf budget list

# Remove a budget
kerf budget remove             # remove for current project

# Check programmatically (for scripts and hooks)
kerf budget check              # exit 0 if under budget, exit 2 if over
kerf budget check --json       # returns JSON with full status
```

What `kerf budget show` looks like:
```
  kerf budget

  Period:  weekly (2026-04-07 to 2026-04-13)
  Budget:  $50.00
  Spent:   $42.30
  [████████████████░░░░] 84.6%
```

**Two enforcement modes:**

| Mode | How to enable | What happens when over budget |
|------|--------------|------------------------------|
| **Warning** (default) | `kerf init` | You see a warning, Claude Code keeps running |
| **Blocking** (strict) | `kerf init --enforce-budgets` | Claude Code physically stops making tool calls |

Warning mode is the safe default for most people. Blocking mode is for when you really need a hard cap (e.g. on a shared API key).

---

#### `kerf estimate` — know the cost before you start

Before starting a big Claude Code task, ask kerf to estimate what it will cost. Uses complexity signals (keywords, file sizes) to predict the number of turns and cost range.

```bash
kerf estimate "fix the login bug"
kerf estimate "rewrite the entire auth module"
kerf estimate "add a new dashboard page with charts"

kerf estimate --compare "add OAuth login"      # compare Sonnet vs Opus vs Haiku side-by-side
kerf estimate --model opus "complex task"       # estimate for a specific model
kerf estimate --files 'src/auth/*.ts' "refactor auth"  # include file context in the estimate
kerf estimate --precise "refactor the parser"  # use Anthropic's API for exact token counts (needs ANTHROPIC_API_KEY)
kerf estimate --json "any task"
```

Example `--compare` output:
```
  kerf-cli estimate: 'add OAuth login'
  Complexity: moderate

  Model      Turns      Low       Expected   High
  -------------------------------------------------------
  sonnet     10-32      $0.96     $1.68      $2.65
  opus       10-32      $4.78     $8.38      $13.26
  haiku      10-32      $0.25     $0.45      $0.71

  Cheapest: haiku at $0.45
  Priciest: opus at $8.38
```

The estimate is a range, not a guarantee. Actual cost depends on how many turns it takes, which files Claude Code reads, and whether it uses tools. Use it as a gut-check before committing to a large task on Opus.

---

#### `kerf audit` — find invisible token waste

Your 200K context window fills up with "ghost tokens" — system prompts, built-in tools, MCP server definitions, and the CLAUDE.md file — before you type a single word. This command quantifies that overhead and grades your setup.

```bash
kerf audit                    # full audit with all checks
kerf audit --claude-md-only   # only analyse your CLAUDE.md file
kerf audit --mcp-only         # only analyse MCP server token cost
kerf audit --fix              # auto-reorder CLAUDE.md to put critical rules where Claude reads them best
kerf audit --json
```

Example output:
```
  kerf-cli audit report

  Context Window Health: B (69% usable)

  Ghost Token Breakdown:
    System prompt:         14,328 tokens   (7.2%)
    Built-in tools:        15,000 tokens   (7.5%)
    MCP tools (0 servers):      0 tokens   (0.0%)
    CLAUDE.md:                427 tokens   (0.2%)
    Autocompact buffer:    33,000 tokens  (16.5%)
    ─────────────────────────────────────────────
    Total overhead:        62,755 tokens  (31.4%)
    Effective window:     137,245 tokens  (68.6%)

  CLAUDE.md Analysis:
    1 critical rule in the low-attention dead zone (lines 30-70%)
```

**Grades:** A (>70% usable) · B (50-70%) · C (30-50%) · D (<30%)

**The CLAUDE.md attention trick:** Claude's attention is U-shaped — it pays most attention to the first 30% and last 30% of your CLAUDE.md, and least attention to the middle 40%. Critical rules (NEVER, ALWAYS, MUST) buried in the middle often get ignored. `kerf audit --fix` automatically reorders them to the attention zones. It makes a `.kerf-backup` first so you can undo it.

---

### Tools for teams and CI/CD

---

#### `kerf ci` — attribute AI cost to a git branch

Tracks how much AI coding cost is attributable to the branch you're currently working on. Useful for:
- Understanding the AI cost of a specific feature or PR
- Setting hard cost limits on a branch to enforce team budgets
- Adding AI cost as a line item to your PR summaries

> **How it works:** kerf records the git branch for every message. `kerf ci` queries your local database filtered to the current branch. It reads from your local machine — a cloud CI runner won't have this data unless you set up a self-hosted runner with your `~/.kerf/kerf.db`.

**`kerf ci report`** — show what a branch cost:

```bash
kerf ci report                            # current branch, current folder
kerf ci report --format json              # machine-readable output
kerf ci report --branch feature/login     # a specific branch
kerf ci report --any-project              # don't filter to current directory
kerf ci report --since 2026-05-01         # only usage after this date
kerf ci report --no-sync                  # skip syncing before reporting
```

Output (Markdown, ready for a PR comment or GitHub Step Summary):
```markdown
### 🪚 kerf — AI coding cost for this branch

**Branch:** `feature/login`

| Metric | Value |
| --- | --- |
| Total cost | **$11.05** |
| Messages | 75 |
| Sessions | 1 |

| Model | Cost | Messages |
| --- | --- | --- |
| claude-opus-4-8 | $8.67 | 59 |
| claude-sonnet-4-6 | $2.38 | 16 |
```

**`kerf ci gate`** — fail a build if cost is too high:

```bash
kerf ci gate --max 10.00               # exit 1 if this branch cost > $10, exit 0 if under
kerf ci gate --max 10 --branch main    # gate a specific branch
kerf ci gate --max 5 --any-project     # don't filter by project path
```

Exit codes: `0` = within limit, `1` = over limit, `2` = bad arguments.

**Add to your GitHub workflow:**

```yaml
# Add AI cost to the PR job summary
- run: npx kerf-cli@latest ci report --format markdown >> $GITHUB_STEP_SUMMARY

# Or use the included composite action (also supports max-usd gating)
- uses: dhanushkumarsivaji/kerf-cli/.github/actions/kerf-cost@main
  with:
    max-usd: "20"           # optional — fail the job if over $20
    comment-summary: "true" # append the report to the job summary
```

---

#### `kerf roi` — is it paying off? *(exploratory)*

A rough "value for money" view that correlates your AI spend against code delivery (commits and merges) for the current repository. Helpful for the recurring question every manager asks: "what are we getting for this spend?"

```bash
kerf roi                    # this month (default)
kerf roi --period week      # this week
kerf roi --period all       # all time
kerf roi --json
```

Example:
```
  kerf roi — month

  Spent:    $23.01
  Commits:  9
  Merges:   0
  Cost / commit: $2.56

  Exploratory: commits/merges are a rough delivery proxy.
```

> Commit counts are a coarse proxy. They don't measure code quality, complexity, or impact. Use this as a conversation starter, not a hard metric.

---

### Ask your AI assistant about your spend

---

#### `kerf mcp` — query costs from inside Claude Code

kerf ships a **Model Context Protocol (MCP) server** that lets Claude Code, Cursor, or any MCP-compatible AI assistant answer questions about your spend directly — without leaving your editor.

Once registered, you can literally ask:
- *"How much have I spent on this project this week?"*
- *"Which model am I spending the most on?"*
- *"Am I on track to stay within my monthly budget?"*

**Register with Claude Code (one-time):**

```bash
claude mcp add kerf -- kerf mcp
```

Then just ask your assistant naturally — it calls kerf's tools and answers in plain English.

**Available tools the assistant can use:**

| Tool | What it returns |
|------|----------------|
| `kerf_summary` | Cost totals + breakdown by model and tool |
| `kerf_query` | Results of any read-only SQL query |
| `kerf_efficiency` | Model usage report + savings opportunities |
| `kerf_forecast` | Projected spend for the current week/month |
| `kerf_budget_status` | Current budget and how much you've used |

**Safety:** The MCP server is completely read-only. It uses the same write-protection as `kerf query` — any attempt to insert, update, or delete data is rejected. It communicates over stdio only (no network port, no external connections).

---

## Importing data from other tools

---

### Cursor, Copilot, and other tools (external additions)

If you use an AI coding tool that kerf doesn't natively support, you (or a community exporter script) can add its usage data manually via a JSON file at `~/.kerf/external-additions.json`.

`kerf sync` picks this file up automatically. You can also import it explicitly:

```bash
kerf import --external                          # import from ~/.kerf/external-additions.json
kerf import --external ./cursor-export.json     # import from a specific file
kerf import --external --dry-run                # preview without writing anything
```

**File format:**

```json
{
  "tool": "cursor",
  "sessions": [
    {
      "sessionId": "cursor-2026-05-29-001",
      "projectPath": "/code/myapp",
      "messages": [
        {
          "id": "m1",
          "model": "claude-sonnet-4",
          "timestamp": "2026-05-29T10:00:00Z",
          "input_tokens": 1200,
          "output_tokens": 800,
          "cache_read_input_tokens": 5000,
          "cache_creation_input_tokens": 0
        }
      ]
    }
  ]
}
```

Fields: `tool` (the tool name, e.g. `"cursor"`), `sessionId` (any unique string), `projectPath` (folder path), and per-message `model`, `timestamp`, token counts, and optionally `cost_usd` (if you already know the cost; otherwise kerf calculates it from the model's pricing).

---

### Gemini CLI, OpenCode, Qwen Code (OpenTelemetry)

Any AI coding tool that emits the [OpenTelemetry GenAI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) can be ingested by kerf. Register your telemetry log files in `~/.kerf/otel-sources.json`:

```json
[
  { "path": "/Users/you/.gemini/telemetry.log", "tool": "gemini" }
]
```

`kerf sync` reads each file, extracts `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, and `gen_ai.request.model`, and stores them in the database tagged with the tool name. After your first sync, run `kerf summary --by-tool` to verify the numbers look right.

---

## Recommended daily workflow

```bash
# Morning: check yesterday's spend
kerf summary --period week

# Before a big task: estimate cost and check your budget
kerf estimate --compare "the task I'm about to start"
kerf budget show

# Any time: open the visual dashboard
kerf dashboard

# Weekly: find wasted money
kerf efficiency
kerf cache

# When something seems wrong: diagnose
kerf doctor
kerf report --period week
```

---

## Quick reference — all commands

| Command | What it does |
|---------|-------------|
| `kerf init` | First-time setup (database + hooks) |
| `kerf init --enforce-budgets` | Setup + hard-block when over budget |
| `kerf doctor` | Check for setup problems |
| `kerf sync` | Import sessions from all tools into the database |
| `kerf sync --tool <id>` | Import from one specific tool |
| `kerf summary` | Cost summary (default: today) |
| `kerf summary --period week\|month\|all` | Different time windows |
| `kerf summary --by-tool` | Split cost by tool (Claude Code vs Codex vs …) |
| `kerf summary --model` | Split cost by model (Opus vs Sonnet vs Haiku) |
| `kerf summary --by-project` | Split cost by project folder |
| `kerf sessions` | List recent sessions |
| `kerf sessions <id>` | Full detail for one session |
| `kerf report` | Detailed report with anomaly detection |
| `kerf efficiency` | Find wasted spend on expensive models |
| `kerf efficiency --cross-tool` | Cross-tool optimization tips |
| `kerf forecast` | Project spend to end of week/month |
| `kerf cache` | Cache hit rate and savings analysis |
| `kerf query "<sql>"` | Run custom SQL against the analytics database |
| `kerf query --examples` | Show example SQL queries |
| `kerf watch` | Live terminal dashboard (while Claude Code is running) |
| `kerf watch --alerts` | Live dashboard + desktop notifications |
| `kerf monitor` | Background alert watcher (headless) |
| `kerf monitor --once` | Check once and exit |
| `kerf monitor --webhook <url>` | Send alerts to Slack/Discord |
| `kerf dashboard` | Open visual web dashboard in browser |
| `kerf budget set <$> --period <p>` | Set a spending limit |
| `kerf budget show` | Show current budget and spend |
| `kerf budget list` | Show all project budgets |
| `kerf budget remove` | Remove budget for current project |
| `kerf budget check` | Exit 0 if under, 2 if over (for scripts) |
| `kerf estimate "<task>"` | Estimate cost before starting |
| `kerf estimate --compare "<task>"` | Compare Sonnet vs Opus vs Haiku |
| `kerf audit` | Find invisible token waste |
| `kerf audit --fix` | Auto-fix CLAUDE.md attention ordering |
| `kerf import` | Import historical Claude Code data into budget tables |
| `kerf import --external [path]` | Import Cursor/Copilot/other tool data |
| `kerf mcp` | Start MCP server (ask AI assistants about your spend) |
| `kerf ci report` | Report branch AI cost as Markdown or JSON |
| `kerf ci gate --max <$>` | Fail CI/build when branch cost is too high |
| `kerf roi` | Spend vs commits/merges (exploratory) |

**Flags that work on most commands:**
- `--json` — machine-readable JSON output
- `--csv` — spreadsheet-friendly CSV output
- `--period today|week|month|all` — time window
- `--project <path>` — filter to a specific project folder
- `--tool claude-code|codex|…` — filter to a specific AI tool
- `--no-sync` — skip auto-sync before querying (faster)

---

## Privacy and data

- **Everything stays on your machine.** Session data, cost calculations, and the database never leave your computer.
- **No telemetry.** kerf does not phone home.
- **No API key needed** for core features. The only optional network call is `kerf estimate --precise`, which uses Anthropic's free token-counting API if you have `ANTHROPIC_API_KEY` set.
- **The one outbound call that's opt-in:** `kerf monitor --webhook <url>` sends anomaly alert text to a webhook URL you explicitly configure. It sends only the alert description — no session content, no file paths.
- **Your database is yours.** `~/.kerf/kerf.db` is a standard SQLite file. Open it with any SQLite client, back it up, or delete it.
- **Open source, MIT licensed.** Read every line of code at [github.com/dhanushkumarsivaji/kerf-cli](https://github.com/dhanushkumarsivaji/kerf-cli).

---

## Files on your machine

```
~/.claude/projects/                  ← Claude Code writes session logs here; kerf reads them
~/.claude/settings.json              ← kerf hooks are registered here (after kerf init)
~/.codex/sessions/                   ← Codex CLI writes session logs here; kerf reads them
~/.kerf/
├── kerf.db                          ← The analytics database (all your cost data)
├── config.json                      ← Alert settings (channels, severity, webhook URL)
├── external-additions.json          ← Optional: manually import Cursor/Copilot/etc. data
├── otel-sources.json                ← Optional: OpenTelemetry log file sources
├── session-log.jsonl                ← Hook event log (written by the notification hook)
└── hooks/
    ├── notification.sh              ← Logs every message (installed by kerf init)
    ├── stop.sh                      ← Budget warning at 80%/100% (installed by kerf init)
    └── pretool.sh                   ← Hard block when over budget (only with --enforce-budgets)
```

---

## Why kerf instead of ccusage?

[ccusage](https://github.com/ryoppippi/ccusage) is a great quick cost checker. kerf is what you reach for when you need more:

| | ccusage | kerf |
|--|---------|------|
| Quick cost check | ✅ | ✅ |
| Budget enforcement | ❌ | ✅ hooks that warn or block |
| Cost-per-project attribution | ❌ | ✅ |
| Model efficiency analysis | ❌ | ✅ $ savings estimate |
| Cache hit rate visibility | ❌ | ✅ |
| Web dashboard | ❌ | ✅ |
| SQL query interface | ❌ | ✅ |
| Multiple AI tools (Codex, etc.) | ❌ | ✅ |
| Real-time anomaly alerts | ❌ | ✅ |
| MCP server (ask in your editor) | ❌ | ✅ |
| CI/CD cost gates | ❌ | ✅ |

They complement each other. Use ccusage for a 5-second check, kerf when you actually want to do something about your spend.

---

## Learn more

- [CHANGELOG.md](CHANGELOG.md) — full version history
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the code is structured (for contributors)

---

## Contributing

```bash
git clone https://github.com/dhanushkumarsivaji/kerf-cli.git
cd kerf-cli
npm install
npm test
```

Issues and PRs are welcome. Please open an issue first for large changes so we can discuss the approach.

### Releasing (maintainers only)

kerf publishes to npm automatically via GitHub Actions — no manual `npm publish`.

**One-time setup:** create an npm Automation token at npmjs.com → Access Tokens, then add it as `NPM_TOKEN` in the GitHub repo's Settings → Secrets and variables → Actions.

**To cut a release:**

```bash
# 1. Update CHANGELOG.md, then bump the version (this also creates a git tag)
npm version 3.4.0 -m "release: v%s"

# 2. Push the commit and the tag
git push && git push --tags
```

Pushing the tag (`v3.4.0`) triggers the workflow: lint → test → build → publish to npm → create GitHub Release with CHANGELOG notes. The workflow is idempotent — if that version is already on npm it skips rather than failing.

---

## License

[MIT](LICENSE) — Dhanush Kumar Sivaji
