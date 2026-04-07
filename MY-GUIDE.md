# kerf-cli — Personal Learning Guide

> Your private cheat sheet. Read top to bottom to learn the tool, then use as reference.

---

## What kerf-cli actually does

kerf reads your `~/.claude/projects/*.jsonl` files (Claude Code's session logs), parses them into a SQLite database at `~/.kerf/kerf.db`, and gives you 15 commands to query, analyze, monitor, and enforce limits on your Claude Code spending.

**Mental model:**
1. **Claude Code writes JSONL** — every session you run gets logged automatically
2. **kerf sync ingests JSONL into SQLite** — fast queries, no re-parsing
3. **kerf commands query the SQLite** — summaries, sessions, efficiency, cache, etc.
4. **kerf hooks intercept Claude Code** — real-time monitoring + budget enforcement

Three categories of commands:
- **Analytics** (looks at past data): sync, summary, sessions, query, efficiency, cache, report
- **Live monitoring** (looks at current session): watch, estimate
- **Setup & enforcement**: init, budget, audit, doctor, import

---

## First 5 minutes — get up and running

```bash
# Install
npm install -g kerf-cli

# One-time setup (creates ~/.kerf/, installs hooks, runs migrations)
kerf init

# Pull all your existing Claude Code history into SQLite
kerf sync

# See what you spent today
kerf summary

# Verify everything is wired up
kerf doctor
```

That's it. You now have queryable analytics over every Claude Code session you've ever run.

---

## Tier 1: Basics (use these every day)

### `kerf summary` — what did I spend?

The bread-and-butter command. Run this whenever you want a cost overview.

```bash
kerf summary                          # today
kerf summary --period week            # last 7 days
kerf summary --period month           # last 30 days
kerf summary --period all             # everything

# Slice it
kerf summary --by-project             # which projects burned the most?
kerf summary --model                  # opus vs sonnet vs haiku breakdown
kerf summary --by-project --model     # both at once

# Filter
kerf summary --project ~/code/myapp   # one project only

# Output formats
kerf summary --json                   # for scripting
kerf summary --csv                    # for spreadsheets
```

**Tip:** Auto-syncs before showing data. Pass `--no-sync` if you want the cached view (faster on huge histories).

### `kerf sessions` — what did I spend it ON?

Lists individual sessions, sorted by recency by default.

```bash
kerf sessions                            # 20 most recent
kerf sessions --limit 50                 # show more
kerf sessions --sort cost                # most expensive first
kerf sessions --sort messages            # longest sessions
kerf sessions --since 2026-04-01         # only after a date
kerf sessions --project ~/code/myapp     # filter by project

# Drill into one session
kerf sessions fa775f86                   # full detail: timeline, models, breakdown
```

**When to use:** "I spent $X today, where exactly did it go?"

### `kerf efficiency` — am I wasting money on Opus?

The command that pays for itself. Compares your Opus usage against what it would have cost on Sonnet.

```bash
kerf efficiency                          # last 30 days
kerf efficiency --period week
kerf efficiency --project ~/code/myapp
kerf efficiency --expensive-sessions     # show top 10 sessions over $5
```

**Output you'll see:**
```
Estimated savings: $139.10 (71.7% of spend)
if Opus traffic were routed to Sonnet for this month.

Total spend: $193.87

Model breakdown:
  opus       $173.88 (89.7% — 2538 msgs, 30 sessions) ##############################
  sonnet      $13.22 (6.8% — 365 msgs, 3 sessions) ##
```

**When to use:** Once a week. If your Opus % is over 50%, you're probably leaving money on the table.

### `kerf doctor` — is everything wired up?

Run when something seems off. It checks 10 things and gives you a fix command for each failure.

```bash
kerf doctor              # human-readable
kerf doctor --json       # for scripting
```

Checks: Claude Code installed, ~/.claude/projects/ has data, kerf DB exists & schema current, hooks installed, last sync recency, billing-surprise warnings, etc.

---

## Tier 2: Pre-flight & live monitoring

### `kerf estimate` — what will this task cost?

Run before kicking off a big Claude Code task.

```bash
kerf estimate "fix typo in README"
kerf estimate "refactor the auth module"
kerf estimate "build a complete dashboard from scratch"

# Compare across all 3 models
kerf estimate --compare "add rate limiting"

# With file context (more accurate)
kerf estimate --files 'src/auth/*.ts' "add OAuth"

# Specific model
kerf estimate --model opus "complex task"
kerf estimate --model haiku "quick lookup"

# Use the Anthropic count_tokens API for precise counts (needs ANTHROPIC_API_KEY)
kerf estimate --precise "refactor parser"

# JSON for scripting
kerf estimate --json "fix bug"
```

**What it tells you:**
- Detected complexity (trivial/simple/moderate/complex/massive) with score
- Estimated turns (low/expected/high)
- Estimated cost in $ (low/expected/high)
- Tool overhead in tokens
- Cost vs typical 5h window AND your actual rolling 5h spend

### `kerf watch` — live cost dashboard

Open a second terminal tab while Claude Code is running:

```bash
kerf watch                          # auto-finds active session
kerf watch --session abc123         # specific session
kerf watch --interval 5000          # slower refresh
```

You'll see live: cost meter, context bar, cache health (HEALTHY/DEGRADED/BROKEN), anomaly alerts, recent messages with per-turn cache ratio.

Press `q` to quit, `b` to toggle budget view.

**When to use:** When you're running a long Claude Code task and want to see costs accumulating in real time.

---

## Tier 3: Budgets & enforcement

### `kerf budget` — set spending limits

```bash
# Set a budget for the current project (cwd)
kerf budget set 50 --period weekly
kerf budget set 10 --period daily
kerf budget set 200 --period monthly

# Check it
kerf budget show
kerf budget show --json

# List all budgets across projects
kerf budget list

# Remove
kerf budget remove
```

### Two enforcement modes

**Default (warning mode):** kerf installs Notification + Stop hooks. You get warnings at 80% and alerts at 100% but Claude Code keeps running.

```bash
kerf init    # default — non-blocking warnings only
```

**Enforcement mode (blocking):** kerf also installs a PreToolUse hook that returns exit code 2 to Claude Code when you're over budget — Claude Code stops the tool call.

```bash
kerf init --enforce-budgets

# After this, set a budget...
kerf budget set 5 --period daily

# ...and Claude Code will be physically blocked when you hit $5
```

### `kerf budget check` — manual hook check

Used internally by the PreToolUse hook, but you can run it manually:

```bash
kerf budget check         # exits 0 if under, 2 if over budget
kerf budget check --json
echo $?                   # check exit code
```

---

## Tier 4: SQL escape hatch

### `kerf query` — your superpower

This is the one feature that no other Claude Code cost tool has. Run arbitrary read-only SQL against your analytics database.

```bash
# See the schema first
kerf query --schema

# Get useful starter queries
kerf query --examples

# Run your own SQL
kerf query "SELECT model, ROUND(SUM(cost_usd), 2) as cost FROM messages GROUP BY model ORDER BY cost DESC"

# Read SQL from a file
kerf query --file my-query.sql

# JSON / CSV output
kerf query --json "SELECT * FROM sessions_meta LIMIT 10"
kerf query --csv "..." > export.csv
```

### Useful queries to memorize

**Top 10 most expensive projects, all time:**
```sql
SELECT project_path, ROUND(SUM(cost_usd), 2) as cost
FROM messages
GROUP BY project_path
ORDER BY cost DESC
LIMIT 10;
```

**Daily spend, last 30 days:**
```sql
SELECT date(timestamp) as day, ROUND(SUM(cost_usd), 2) as cost
FROM messages
WHERE timestamp > date('now', '-30 days')
GROUP BY day
ORDER BY day DESC;
```

**Model breakdown for the past week:**
```sql
SELECT model,
       ROUND(SUM(cost_usd), 2) as cost,
       COUNT(*) as messages,
       COUNT(DISTINCT session_id) as sessions
FROM messages
WHERE timestamp > date('now', '-7 days')
GROUP BY model;
```

**Sessions over $5:**
```sql
SELECT session_id, project_path, total_cost_usd, message_count
FROM sessions_meta
WHERE total_cost_usd > 5
ORDER BY total_cost_usd DESC;
```

**Hourly spend today:**
```sql
SELECT strftime('%H', timestamp) as hour,
       ROUND(SUM(cost_usd), 2) as cost
FROM messages
WHERE date(timestamp) = date('now')
GROUP BY hour
ORDER BY hour;
```

**Cache hit rate by model:**
```sql
SELECT model,
       ROUND(100.0 * SUM(cache_read_tokens) / NULLIF(SUM(cache_read_tokens + cache_creation_tokens + input_tokens), 0), 1) as hit_rate_pct
FROM messages
WHERE timestamp > date('now', '-7 days')
GROUP BY model;
```

### What kerf BLOCKS

The query command rejects: INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, ATTACH, PRAGMA, REPLACE, TRUNCATE. It's read-only by design — your analytics data is safe from typos.

---

## Tier 5: Cache optimization

### `kerf cache` — am I getting cache hits?

Cache reads are 90% cheaper than full input. If your hit rate is below 70%, you're paying way more than you should.

```bash
kerf cache                           # last 30 days overview
kerf cache --period week
kerf cache --project ~/code/myapp
kerf cache --poor-sessions           # which sessions have terrible cache utilization?
kerf cache --json
```

**What you'll see:**
- Cache hit rate (colored green/yellow/red)
- Tokens cached vs not cached
- $ saved by cache
- $ you could still save if hit rate hit 80%

**Tip:** Run `kerf cache --poor-sessions` and look at the top results. Those are sessions where you'd save the most by improving cache utilization (usually: avoid `--resume`, don't paste large new content mid-session).

---

## Tier 6: CLAUDE.md & ghost token optimization

### `kerf audit` — find invisible token waste

Ghost tokens = context consumed before your conversation even starts. Usually ~36% of your 200K window.

```bash
kerf audit                           # full breakdown
kerf audit --claude-md-only          # per-section CLAUDE.md analysis
kerf audit --mcp-only                # MCP server analysis
kerf audit --json
```

**You'll see grades:**
- A: >70% usable window (healthy)
- B: 50-70% (some optimization possible)
- C: 30-50% (concerning)
- D: <30% (critical — most of your window is overhead)

### `kerf audit --fix` — auto-reorder CLAUDE.md

CLAUDE.md attention is U-shaped: top 30% and bottom 30% get high attention, middle 30-70% is a "dead zone." If you have critical rules (NEVER, ALWAYS, MUST) stuck in the dead zone, kerf can auto-reorder them.

```bash
kerf audit --fix
```

It creates a `.kerf-backup` first so you can always undo.

---

## Tier 7: Advanced analytics

### `kerf report` — historical reports with visualizations

```bash
kerf report                              # today
kerf report --period week
kerf report --period month
kerf report --sessions --model           # both breakdowns
kerf report --csv                        # CSV export
kerf report --json
```

This shows hourly bar charts, cache health, anomaly alerts, and per-session breakdowns.

### `kerf import` — sync historical data into the budget DB

The newer `sync` command writes to the analytics DB. The older `import` command writes to the budget tracking tables. They're complementary.

```bash
kerf import                              # full sync
kerf import --since 2026-03-01           # only after a date
kerf import --dry-run                    # preview without writing
```

**You'll usually use `kerf sync` instead.** Keep `kerf import` in mind if you're using budget tracking and want to backfill it.

---

## How everything fits together

```
Claude Code session → ~/.claude/projects/<encoded>/<session>.jsonl
                                  ↓
                              kerf sync
                                  ↓
                          ~/.kerf/kerf.db
                                  ↓
        ┌─────────────┬──────────┴─────────┬──────────────┐
        ↓             ↓                    ↓              ↓
   kerf summary   kerf sessions      kerf efficiency   kerf query
   kerf report    kerf cache         kerf doctor       (your SQL)

LIVE MONITORING (current session):
   Claude Code running → kerf watch (live TUI)
                       → kerf estimate (pre-flight)

ENFORCEMENT (intercepts Claude Code):
   kerf init → installs Notification + Stop hooks (warnings)
   kerf init --enforce-budgets → also installs PreToolUse (blocking)
   kerf budget set → set the limit
   kerf budget check → what the hooks call
```

---

## My personal recommended workflow

**Daily (30 seconds):**
```bash
kerf summary --by-project
```
Quick check on what I spent today and where it went.

**Weekly (2 minutes):**
```bash
kerf summary --period week
kerf efficiency
kerf cache
```
Review the week, see if I should be using Sonnet more, check cache utilization.

**Monthly (5 minutes):**
```bash
kerf summary --period month --by-project --model
kerf efficiency --period month --expensive-sessions
kerf sessions --sort cost --limit 20
```
Big-picture review. Find the most expensive sessions and see if any patterns emerge.

**Before starting anything big:**
```bash
kerf estimate --compare "what I'm about to ask Claude to do"
kerf budget show
```

**When something looks wrong:**
```bash
kerf doctor
kerf audit
```

**When I want a custom view:**
```bash
kerf query "SELECT ... FROM messages WHERE ..."
```

---

## Keyboard / shell tips

### Make it shorter

```bash
# In ~/.zshrc or ~/.bashrc
alias k="kerf"
alias ks="kerf summary"
alias ke="kerf efficiency"
alias kw="kerf watch"
```

Then: `k summary`, `ks --by-project`, `ke`, `kw`.

### Pipe to jq for scripting

```bash
kerf summary --json | jq '.totalCost'
kerf efficiency --json | jq '.estimatedSavings.switchOpusToSonnet.savedUsd'
kerf sessions --json | jq '.[] | select(.cost > 5)'
```

### Open the SQLite DB directly

```bash
sqlite3 ~/.kerf/kerf.db
.tables
.schema messages
SELECT COUNT(*) FROM messages;
```

If you're comfortable with sqlite3, you have the same access kerf does — kerf doesn't hide anything.

---

## Where things live

```
~/.claude/projects/                  # Claude Code's session JSONLs (kerf reads from here)
~/.claude/settings.json              # Hooks live here after kerf init
~/.kerf/                             # Everything kerf
├── kerf.db                          # SQLite analytics + budgets
├── session-log.jsonl                # Hook event log
└── hooks/
    ├── notification.sh              # Notification hook script
    ├── stop.sh                      # Stop hook script
    └── pretool.sh                   # PreToolUse hook (only if --enforce-budgets)
```

---

## All 15 commands reference

| Command | What it does |
|---------|-------------|
| `kerf init` | First-time setup (creates DB, installs hooks) |
| `kerf init --enforce-budgets` | Same + installs blocking PreToolUse hook |
| `kerf doctor` | Diagnose setup issues |
| `kerf sync` | Ingest Claude Code JSONL into analytics DB |
| `kerf summary` | Cost summary with --period --by-project --model |
| `kerf sessions` | List or inspect individual sessions |
| `kerf query "<sql>"` | Read-only SQL escape hatch |
| `kerf efficiency` | Model usage analyzer with $ savings |
| `kerf cache` | Cache hit rate analysis |
| `kerf report` | Historical reports with charts |
| `kerf import` | Sync to budget DB (older path, kept for compat) |
| `kerf watch` | Live cost dashboard |
| `kerf estimate <task>` | Pre-flight cost estimation |
| `kerf budget set/show/list/remove/check` | Budget management |
| `kerf audit` | Ghost token + CLAUDE.md audit |
| `kerf audit --fix` | Auto-reorder CLAUDE.md |

> All commands work as both `kerf` and `kerf-cli`.

---

## Common questions I'll have later

**Q: I deleted ~/.kerf/kerf.db, now what?**
A: `kerf init && kerf sync` — fully rebuilds from JSONL.

**Q: kerf says "no data" but I just ran Claude Code.**
A: Run `kerf sync` — JSONL writes have a delay. Or check `kerf doctor` for setup issues.

**Q: How do I see exactly what Opus cost me last month?**
A: `kerf query "SELECT ROUND(SUM(cost_usd), 2) FROM messages WHERE model LIKE '%opus%' AND timestamp >= date('now', '-30 days')"`

**Q: I want to know which project burned the most money this week.**
A: `kerf summary --by-project --period week`

**Q: I want to back up my kerf data.**
A: `cp ~/.kerf/kerf.db ~/Desktop/kerf-backup-$(date +%F).db`

**Q: I need to wipe and start over.**
A: `rm ~/.kerf/kerf.db && kerf init && kerf sync`

**Q: How do I know if my hooks are actually working?**
A: `kerf doctor` checks all of them. To test the budget enforcement specifically: `kerf budget set 0.01 --period daily && kerf init --enforce-budgets`, then try a Claude Code session.

**Q: What's the difference between `sync` and `import`?**
A: `sync` is the new analytics path — writes to `messages`/`sessions_meta` for queries. `import` is the older budget-tracking path — writes to `usage_snapshots` used by `kerf budget show`. Both read the same JSONL.

**Q: Why does `kerf summary` and `kerf budget show` sometimes disagree?**
A: They query different tables. `summary` uses the new analytics tables (populated by `sync`). `budget show` uses the old budget tables (populated by `import` or auto-sync from JSONL on the first `budget show` per period).

---

## What kerf doesn't do (yet)

- **Web dashboard** — was in v1.x, removed in v2.0 to focus the launch. Returning as a paid team-tier feature.
- **Multi-tool support** — only Claude Code right now. Cursor/Codex/Aider on the v2.x roadmap.
- **Team aggregation** — single-developer machine only.
- **Slack/Discord alerts** — just terminal hooks for now.

---

## Quick refresher: the 5 commands I'll actually use most

1. `kerf summary` — what did I spend?
2. `kerf efficiency` — am I wasting on Opus?
3. `kerf sessions` — where exactly did the money go?
4. `kerf estimate "..."` — what will this cost me?
5. `kerf query "..."` — when I need something specific

That's it. Everything else is a tool to reach for when you need it.
