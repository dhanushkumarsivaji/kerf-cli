# kerf-cli User Guide

A complete guide to using kerf-cli for Claude Code cost intelligence.

---

## Table of Contents

- [Installation](#installation)
- [Getting Started](#getting-started)
- [Monitoring a Live Session](#monitoring-a-live-session)
- [Estimating Costs Before You Start](#estimating-costs-before-you-start)
- [Setting Up Budgets](#setting-up-budgets)
- [Auditing Your Setup](#auditing-your-setup)
- [Viewing Historical Reports](#viewing-historical-reports)
- [Using With an Active Claude Code Session](#using-with-an-active-claude-code-session)
- [Automating With Hooks](#automating-with-hooks)
- [Tips & Best Practices](#tips--best-practices)
- [Troubleshooting](#troubleshooting)

---

## Installation

### Quick (no install needed)

```bash
npx kerf-cli@latest --help
```

### Global install (recommended for frequent use)

```bash
npm install -g kerf-cli
kerf-cli --help
```

### Shell alias (convenience)

Add this to your `~/.zshrc` or `~/.bashrc`:

```bash
alias kerf="npx kerf-cli@latest"
```

Then use `kerf watch`, `kerf audit`, etc.

---

## Getting Started

### First-time setup

Run `init` to create the database and optionally install hooks:

```bash
npx kerf-cli init
```

This will:
1. Create `~/.kerf/` directory for data storage
2. Initialize the SQLite database at `~/.kerf/kerf.db`
3. Detect compatible tools (RTK, ccusage)
4. Optionally install hooks for automatic tracking

### Verify it works

```bash
npx kerf-cli audit
```

You should see a context window health report showing your ghost token overhead.

---

## Monitoring a Live Session

### The scenario

You have Claude Code running in one terminal tab. You want to see how much it's costing you in real time.

### How to do it

**Step 1:** Open a second terminal tab (Cmd+T / Ctrl+Shift+T).

**Step 2:** Run the watch dashboard:

```bash
npx kerf-cli watch
```

kerf-cli automatically finds the most recently active Claude Code session and starts monitoring it.

### What you'll see

```
┌──────────────────────────────────────────────────────────────┐
│  kerf-cli watch | session: a3f8c2d1... | 12 messages         │
├──────────────────────────────────────────────────────────────┤
│  >> $2.34 / ~$15.00 window | $0.12/min | ~1h 45m remaining  │
│  [████████░░░░░░░░░░░░░░░░░░░░░░] 28% | 56K / 200K tokens   │
│    system(14K) + tools(15K) + mcp(0K) + claude.md(0K)       │
│                                                              │
│  Recent Messages:                                            │
│  10:45:02  3.2K tok  $0.12                                   │
│  10:47:18  5.1K tok  $0.24                                   │
│  10:49:55  2.8K tok  $0.09                                   │
└──────────────────────────────────────────────────────────────┘
```

- **Top bar:** Current spend vs projected window cost, burn rate, time remaining
- **Context bar:** How much of the 200K context window is used
- **Ghost token breakdown:** Where your overhead goes (system prompt, tools, MCP, CLAUDE.md)
- **Recent messages:** Token count and cost per message

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `q` | Quit the dashboard |
| `b` | Toggle budget view |

### Options

```bash
# Watch a specific session
npx kerf-cli watch --session abc123

# Watch sessions for a specific project
npx kerf-cli watch --project /path/to/project

# Change refresh interval (default: 2000ms)
npx kerf-cli watch --interval 5000
```

---

## Estimating Costs Before You Start

### The scenario

You're about to ask Claude Code to refactor a module. You want to know roughly how much it'll cost before you start.

### How to do it

```bash
npx kerf-cli estimate 'refactor the auth module'
```

### What you'll see

```
╭──────────────────────────────────────────────────────────╮
│  kerf-cli estimate: 'refactor the auth module'           │
│                                                          │
│  Model: sonnet                                           │
│  Estimated turns: 15-40 (expected: 25)                   │
│  Files: 12.4K tokens                                     │
│  Context overhead: 62.7K tokens (ghost tokens)           │
│                                                          │
│  Estimated Cost:                                         │
│    Low:      $2.10                                       │
│    Expected: $5.80                                       │
│    High:     $12.40                                      │
│                                                          │
│  Window Usage: ~15% of 5-hour window                     │
│    -> Using Opus would cost ~$29.00 (5x more)            │
╰──────────────────────────────────────────────────────────╯
```

### How it works

kerf-cli classifies your task by complexity:

| Complexity | Keywords | Estimated Turns |
|-----------|----------|-----------------|
| Simple | typo, rename, delete, update version | 2-5 turns |
| Medium | fix, add, update, change | 5-15 turns |
| Complex | refactor, rewrite, build, implement, migrate | 15-40 turns |

It then calculates cost based on:
- Context overhead (ghost tokens)
- File sizes that will be touched
- Conversation growth per turn
- Cache hit rate (90% after turn 2)
- Model pricing

### Options

```bash
# Estimate for a specific model
npx kerf-cli estimate 'add rate limiting' --model opus

# Specify which files will be touched
npx kerf-cli estimate 'add rate limiting' --files 'src/auth/*.ts'

# Compare costs across all models
npx kerf-cli estimate 'add rate limiting' --compare

# Get JSON output (for scripting)
npx kerf-cli estimate 'add rate limiting' --json
```

### Example: compare models

```bash
npx kerf-cli estimate --compare 'build a new dashboard'
```

This shows side-by-side estimates for Sonnet, Opus, and Haiku so you can pick the right model for the job.

---

## Setting Up Budgets

### The scenario

You want to limit spending to $50/week on a project so you don't blow through your Claude Code plan.

### Set a budget

```bash
# Set $50/week budget for current project
npx kerf-cli budget set 50 --period weekly

# Set $10/day budget
npx kerf-cli budget set 10 --period daily

# Set $200/month budget
npx kerf-cli budget set 200 --period monthly

# Set budget for a specific project
npx kerf-cli budget set 50 --period weekly --project /path/to/project
```

### Check your budget

```bash
npx kerf-cli budget show
```

```
  kerf-cli budget

  Period:  weekly (2026-03-31 to 2026-04-06)
  Budget:  $50.00
  Spent:   $42.30
  [████████████████░░░░] 84.6%
```

### List all project budgets

```bash
npx kerf-cli budget list
```

### Remove a budget

```bash
npx kerf-cli budget remove
```

### How budget enforcement works

If you've run `kerf-cli init` and installed hooks:
- At **80% budget used:** You get a warning message in Claude Code
- At **100% budget used:** You get an over-budget alert
- Budget enforcement runs automatically via the Stop hook

---

## Auditing Your Setup

### The scenario

Claude Code seems to be using a lot of tokens and you're not sure why. You want to find hidden overhead.

### Run a full audit

```bash
npx kerf-cli audit
```

### What you'll see

```
  kerf-cli audit report

  Context Window Health: B (62% usable)

  Ghost Token Breakdown:
    System prompt:         14,328 tokens (7.2%)
    Built-in tools:        15,000 tokens (7.5%)
    MCP tools (3 srv):      8,400 tokens (4.2%)
    CLAUDE.md:              2,100 tokens (1.1%)
    Autocompact buffer:    33,000 tokens (16.5%)
    ----------------------------------------
    Total overhead:        72,828 tokens (36.4%)
    Effective window:     127,172 tokens (63.6%)

  CLAUDE.md Analysis:
    Lines: 245 (over 200 limit)
    Tokens: 2,100
    Critical rules in dead zone: 3

  Recommendations:
    1. [HIGH] Reorder CLAUDE.md — 3 critical rules in dead zone
       Impact: improved rule adherence
    2. [HIGH] CLAUDE.md is 245 lines (limit: 200). Trim or move to skills.
       Impact: 45 lines over limit
    3. [MED] MCP server 'playwright' has 12 tools. Consider disabling.
       Impact: -7,200 tokens/session
```

### Understanding the grades

| Grade | Usable Window | Meaning |
|-------|--------------|---------|
| A | >70% | Healthy — minimal overhead |
| B | 50-70% | Good — some optimization possible |
| C | 30-50% | Concerning — significant overhead |
| D | <30% | Critical — most of your window is ghost tokens |

### Understanding ghost tokens

Ghost tokens are context window space consumed before your conversation even starts:

- **System prompt (14,328):** Claude Code's built-in instructions. Fixed, can't change.
- **Built-in tools (15,000):** Read, Write, Edit, Bash, etc. Fixed, can't change.
- **MCP tools (varies):** Each MCP tool costs ~600 tokens. More servers = more overhead.
- **CLAUDE.md (varies):** Your project instructions. Loaded every session.
- **Autocompact buffer (33,000):** Reserved space for context compression. Fixed.

### Understanding the CLAUDE.md attention curve

Claude's attention follows a U-shaped curve:
- **Position 0-30%:** HIGH attention (top of file) — put critical rules here
- **Position 30-70%:** LOW attention (middle) — the "dead zone"
- **Position 70-100%:** HIGH attention (bottom of file) — good for critical rules

kerf-cli flags critical rules (NEVER, ALWAYS, MUST, CRITICAL) that are stuck in the dead zone.

### Options

```bash
# Only audit CLAUDE.md
npx kerf-cli audit --claude-md-only

# Only audit MCP servers
npx kerf-cli audit --mcp-only

# JSON output
npx kerf-cli audit --json
```

---

## Viewing Historical Reports

### The scenario

You want to see how much you've spent today, this week, or on a specific project.

### Today's report

```bash
npx kerf-cli report
```

```
  kerf-cli report -- Sat, Apr 4, 2026

  Total Cost:       $8.42
  Total Tokens:     1.2M in / 8.2K out
  Cache Hit Rate:   94.2%
  Sessions:         4
```

### Weekly report

```bash
npx kerf-cli report --period week
```

### Monthly report

```bash
npx kerf-cli report --period month
```

### All time

```bash
npx kerf-cli report --period all
```

### Detailed breakdowns

```bash
# Per-model breakdown
npx kerf-cli report --model

# Per-session breakdown
npx kerf-cli report --sessions

# Both
npx kerf-cli report --model --sessions
```

### Export data

```bash
# CSV (for spreadsheets)
npx kerf-cli report --period week --csv > costs.csv

# JSON (for scripts)
npx kerf-cli report --period week --json
```

---

## Using With an Active Claude Code Session

This is the most common workflow. Here's exactly how to use kerf-cli alongside Claude Code.

### Workflow 1: Quick check before starting

```bash
# 1. Before asking Claude to do something expensive:
npx kerf-cli estimate 'refactor the database layer'

# 2. Check your remaining budget:
npx kerf-cli budget show

# 3. If it looks good, start Claude Code and work
```

### Workflow 2: Live monitoring

```
Terminal Tab 1 (Claude Code):        Terminal Tab 2 (kerf-cli):
┌──────────────────────────┐         ┌──────────────────────────┐
│ $ claude                 │         │ $ npx kerf-cli watch     │
│                          │         │                          │
│ > Fix the auth bug in    │         │ >> $1.20 / ~$8.00 window │
│   src/auth/login.ts      │         │ [████░░░░░░] 18%         │
│                          │         │                          │
│ I'll fix the auth bug... │         │ 10:30:02  2.1K  $0.08    │
│                          │         │ 10:30:45  3.4K  $0.15    │
└──────────────────────────┘         └──────────────────────────┘
```

1. Open Terminal Tab 1 — start Claude Code as normal
2. Open Terminal Tab 2 — run `npx kerf-cli watch`
3. kerf-cli auto-detects the active session and shows live costs
4. Press `q` to quit the dashboard when done

### Workflow 3: End-of-day review

```bash
# See what you spent today
npx kerf-cli report

# See per-session costs
npx kerf-cli report --sessions

# Check if you're on track with your budget
npx kerf-cli budget show
```

### Workflow 4: Optimize your setup

```bash
# Run audit to find waste
npx kerf-cli audit

# Common findings:
# - CLAUDE.md is too long → trim it
# - MCP servers you don't use → disable them
# - Critical rules in dead zone → reorder CLAUDE.md
```

---

## Automating With Hooks

### What are hooks?

Claude Code hooks are shell scripts that run automatically at specific events. kerf-cli uses two hooks:

1. **Notification hook:** Logs token usage to `~/.kerf/session-log.jsonl` after each message
2. **Stop hook:** Checks your budget and warns you when you're approaching the limit

### Installing hooks

```bash
# Install hooks for current project
npx kerf-cli init

# Install hooks globally (applies to all projects)
npx kerf-cli init --global
```

### What the hooks do

**Notification hook** (runs after each Claude response):
- Records timestamp, session ID, and token metrics
- Writes to `~/.kerf/session-log.jsonl`
- Zero impact on Claude Code performance

**Stop hook** (runs when Claude finishes a response):
- Checks your budget via `kerf-cli budget show --json`
- At 80%: Adds a warning to Claude's context
- At 100%: Alerts that budget is exceeded
- Does NOT block Claude Code by default (configurable)

### Skipping hooks during setup

```bash
# Set up database only, no hooks
npx kerf-cli init --no-hooks
```

---

## Tips & Best Practices

### 1. Use Sonnet for implementation, Opus for planning

```bash
# Check the price difference before switching models
npx kerf-cli estimate --compare 'your task here'
```

Opus typically costs 5x more than Sonnet. Use it only when you need the extra reasoning.

### 2. Keep CLAUDE.md under 200 lines

```bash
# Check your CLAUDE.md health
npx kerf-cli audit --claude-md-only
```

Move detailed instructions to Claude Code skills instead of bloating CLAUDE.md.

### 3. Disable MCP servers you don't use

Each MCP tool costs ~600 tokens of context. A server with 10 tools = 6,000 tokens of overhead every message.

```bash
# See which MCP servers are costing you
npx kerf-cli audit --mcp-only
```

### 4. Monitor cache hit rate

High cache hit rates (>80%) mean Claude is efficiently reusing context. Low rates mean you're paying full price for repeated context.

```bash
npx kerf-cli report --period today
```

### 5. Set weekly budgets

Weekly budgets give you enough flexibility for busy and quiet days while preventing runaway costs.

```bash
npx kerf-cli budget set 50 --period weekly
```

### 6. Review costs regularly

Make it a habit to check your daily report:

```bash
npx kerf-cli report
```

---

## Troubleshooting

### "No active Claude Code session found"

kerf-cli looks for JSONL files in `~/.claude/projects/` modified in the last 5 hours.

**Fixes:**
- Make sure Claude Code is running and has sent at least one message
- Check that `~/.claude/projects/` exists: `ls ~/.claude/projects/`
- Try specifying the project: `npx kerf-cli watch --project ~/.claude/projects/`

### Dashboard shows no data

The JSONL log file may not have usage data yet.

**Fixes:**
- Send a message in Claude Code and wait for a response
- Check the session file exists: `ls -la ~/.claude/projects/*/`

### Costs seem wrong

kerf-cli uses a token heuristic (characters / 3.5) for estimates. Actual costs come from JSONL logs.

**Notes:**
- If `total_cost_usd` is present in the JSONL, kerf-cli uses that (it's authoritative)
- Otherwise, it calculates from token counts and model pricing
- Pricing is based on published Anthropic rates as of May 2025

### "Command not found: kerf-cli"

If you installed globally:
```bash
npm install -g kerf-cli
```

Or use npx:
```bash
npx kerf-cli@latest --help
```

### Database errors

Reset the database:
```bash
rm ~/.kerf/kerf.db
npx kerf-cli init
```

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `npx kerf-cli init` | First-time setup |
| `npx kerf-cli watch` | Live cost dashboard |
| `npx kerf-cli estimate '<task>'` | Pre-flight cost estimate |
| `npx kerf-cli estimate --compare '<task>'` | Compare Sonnet vs Opus vs Haiku |
| `npx kerf-cli budget set 50 --period weekly` | Set weekly budget |
| `npx kerf-cli budget show` | Check budget status |
| `npx kerf-cli audit` | Find ghost token waste |
| `npx kerf-cli report` | Today's cost report |
| `npx kerf-cli report --period week --csv` | Export weekly costs |
| `npx kerf-cli --help` | Show all commands |
