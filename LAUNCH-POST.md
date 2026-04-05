# kerf-cli — Launch Post Brief

> Use this document to generate a launch post for Twitter/X, Reddit, LinkedIn, or any platform.

---

## What It Is

**kerf-cli** — Cost intelligence for Claude Code. Real-time dashboards, pre-flight cost estimation, per-project budgets, and ghost token auditing.

- **npm:** https://www.npmjs.com/package/kerf-cli
- **GitHub:** https://github.com/dhanushkumarsivaji/kerf-cli
- **Install:** `npx kerf-cli@latest`
- **Author:** Dhanush Kumar Sivaji

---

## The Problem It Solves

Claude Code users have no visibility into token spending during sessions. People exhaust their 20x Max plan in under 20 minutes without knowing why. Context windows get silently consumed by ghost tokens — system prompts (14K), built-in tools (15K), MCP servers, CLAUDE.md files, and autocompact buffers — before any conversation even starts.

---

## What It Does (6 Commands)

### 1. `kerf-cli watch` — Real-Time Dashboard
Live cost monitoring in a second terminal tab while Claude Code runs.

```
┌──────────────────────────────────────────────────────────────┐
│  kerf-cli watch | session: a3f8c2d1... | 47 messages         │
├──────────────────────────────────────────────────────────────┤
│  >> $4.82 / ~$15.00 window | $0.18/min | ~56m remaining     │
│  [████████████░░░░░░░░░░░░░░░░░░] 38% | 76K / 200K tokens   │
│    system(14K) + tools(15K) + mcp(8K) + conversation(39K)   │
└──────────────────────────────────────────────────────────────┘
```

### 2. `kerf-cli estimate` — Pre-Flight Cost Estimation
Know what a task will cost before you start. Compares Sonnet vs Opus vs Haiku.

```
$ kerf-cli estimate --compare 'add feature'

  Model      Turns      Low          Expected     High
  ----------------------------------------------------------
  sonnet     5-15       $0.67        $1.05        $1.45
  opus       5-15       $3.35        $5.24        $7.26
  haiku      5-15       $0.18        $0.28        $0.39
```

### 3. `kerf-cli budget` — Per-Project Budgets
Set weekly/monthly spending limits. Automatic warnings at 80% and alerts at 100%.

```
$ kerf-cli budget show

  Budget:  $50.00/weekly
  Spent:   $42.30
  [████████████████░░░░] 84.6%
```

### 4. `kerf-cli audit` — Ghost Token Audit
Find invisible token waste eating your 200K context window.

```
$ kerf-cli audit

  Context Window Health: B (62% usable)

  Ghost Token Breakdown:
    System prompt:     14,328 tokens (7.2%)
    Built-in tools:    15,000 tokens (7.5%)
    MCP tools (3 srv):  8,400 tokens (4.2%)
    CLAUDE.md:          2,100 tokens (1.1%)
    Autocompact buffer:33,000 tokens (16.5%)
    Total overhead:    72,828 tokens (36.4%)

  Recommendations:
    1. [HIGH] Reorder CLAUDE.md — 3 critical rules in dead zone
    2. [MED] Disable unused 'playwright' MCP server (-7,200 tokens)
```

### 5. `kerf-cli audit --claude-md-only` — CLAUDE.md Attention Curve Analysis
Maps each section to Claude's U-shaped attention curve. Flags critical rules (NEVER, ALWAYS, MUST) stuck in the low-attention "dead zone" (30-70% of file).

```
  Sections:
    Conventions                 110 tokens  L15-23 [dead zone] *critical rules*
    Key Paths                    87 tokens  L24-30 [dead zone]
    Testing                      26 tokens  L31-35 [high attention]
```

### 6. `kerf-cli report` — Historical Cost Reports
Daily/weekly/monthly spending with hourly charts, per-model and per-session breakdowns. CSV and JSON export.

```
$ kerf-cli report --sessions --model

  Total Cost:       $12.77
  Cache Hit Rate:   100.0%

  Model Breakdown:
    sonnet: $6.20 (73.6%) — 3 sessions
    opus:   $2.22 (26.4%) — 1 session

  Hourly:
    Apr 4, 2 PM    ████░░░░░░░░ $1.75
    Apr 4, 6 PM    ████████████ $5.64
```

---

## Tech Stack

- TypeScript, Commander.js, Ink (React for CLI), better-sqlite3, chokidar, Day.js
- Parses Claude Code's JSONL session logs from `~/.claude/projects/`
- Stores budgets in SQLite at `~/.kerf/kerf.db`
- 34 tests passing, zero TypeScript errors
- Bundled with tsup, published as ESM

---

## How It Was Built

Built entirely in a single Claude Code session using Opus. The entire project — scaffolding, 7 core modules, 5 Ink UI components, 6 CLI commands, 4 audit analyzers, hook system, SQLite schema, 34 tests, CI/CD, README, and npm publishing — was implemented from a detailed implementation guide in one conversation.

---

## Comparison

| Feature | kerf-cli | RTK | ccusage | token-optimizer |
|---------|----------|-----|---------|-----------------|
| Real-time dashboard | Yes | No | No | No |
| Pre-flight estimation | Yes | No | No | No |
| Per-project budgets | Yes | No | No | No |
| Ghost token audit | Yes | No | No | Partial |
| CLAUDE.md optimization | Yes | No | No | Yes |
| Historical reports | Yes | No | Yes | No |

**RTK compresses. ccusage tracks. kerf predicts.**

---

## Quick Start (3 commands)

```bash
npx kerf-cli@latest init      # set up database & hooks
npx kerf-cli@latest watch     # live dashboard in second terminal
npx kerf-cli@latest audit     # find ghost token waste
```

---

## Key Stats

- **Package:** kerf-cli on npm
- **Version:** 0.1.5
- **Size:** 56KB bundled
- **Tests:** 34 passing
- **License:** MIT
- **Node:** 20+
- **Published:** April 4, 2026

---

## Taglines (pick one)

- "Cost intelligence for Claude Code. Know before you spend."
- "Stop burning tokens blind. kerf-cli gives you a dashboard for Claude Code."
- "Your Claude Code plan just got a speedometer."
- "Every token has a kerf. Now you can see it."
- "I built a CLI that shows you exactly where your Claude Code tokens go."
