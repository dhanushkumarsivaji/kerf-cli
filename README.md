# kerf-cli

**Cost intelligence for Claude Code. Know before you spend.**

> *kerf (n.) — the width of material removed by a cutting tool. Every token operation has a kerf.*

[![npm version](https://img.shields.io/npm/v/kerf-cli)](https://www.npmjs.com/package/kerf-cli)
[![CI](https://github.com/dhanushkumarsivaji/kerf-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/dhanushkumarsivaji/kerf-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-green.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)]()

```
┌──────────────────────────────────────────────────────────────┐
│  kerf watch | session: a3f8c2d1... | 47 messages             │
├──────────────────────────────────────────────────────────────┤
│  >> $4.82 / ~$15.00 window | $0.18/min | ~56m remaining     │
│  [████████████░░░░░░░░░░░░░░░░░░] 38% | 76K / 200K tokens   │
│    system(14K) + tools(15K) + mcp(8K) + conversation(39K)   │
│                                                              │
│  Recent Messages:                                            │
│  10:45:02  3.2K tok  $0.12                                   │
│  10:47:18  5.1K tok  $0.24                                   │
│  10:49:55  2.8K tok  $0.09                                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
npx kerf-cli@latest init      # Set up hooks & database
npx kerf-cli@latest watch     # Real-time cost dashboard
npx kerf-cli@latest audit     # Find ghost token waste
```

After global install (`npm i -g kerf-cli`), use the shorter `kerf` command:

```bash
kerf watch
kerf estimate 'refactor auth'
kerf audit
```

> Both `kerf` and `kerf-cli` work as command names.

---

## The Problem

> "20x Max plan exhausted in 19 minutes"

Claude Code sessions burn through tokens fast — context overhead, MCP tools, bloated CLAUDE.md files — and there's no way to see it in real time. kerf fixes that with live dashboards, pre-flight estimates, budgets, and ghost token auditing.

---

## Installation

```bash
# No install needed — run directly via npx
npx kerf-cli@latest --help

# Or install globally for the shorter 'kerf' command
npm install -g kerf-cli
kerf --help
```

### First-time setup

```bash
kerf init
```

Creates `~/.kerf/` directory, initializes the SQLite database, and optionally installs Claude Code hooks for automatic tracking.

---

## Using With Claude Code

### Live monitoring (most common workflow)

Run Claude Code in one tab, kerf in another:

```
Terminal Tab 1 (Claude Code):        Terminal Tab 2 (kerf):
┌──────────────────────────┐         ┌──────────────────────────┐
│ $ claude                 │         │ $ kerf watch             │
│                          │         │                          │
│ > Fix the auth bug in    │         │ >> $1.20 / ~$8.00 window │
│   src/auth/login.ts      │         │ [████░░░░░░] 18%         │
│                          │         │                          │
│ I'll fix the auth bug... │         │ 10:30:02  2.1K  $0.08    │
│                          │         │ 10:30:45  3.4K  $0.15    │
└──────────────────────────┘         └──────────────────────────┘
```

Auto-detects the active session. Press `q` to quit, `b` to toggle budget view.

### Before starting work

```bash
kerf estimate 'refactor the auth module'
kerf budget show
```

### End-of-day review

```bash
kerf report
kerf report --sessions
```

---

## Features

### Real-Time Dashboard — `kerf watch`

Live cost monitoring with burn rate, context usage, and projected costs. Refreshes every 2 seconds.

```bash
kerf watch                     # auto-find active session
kerf watch --session abc123    # specific session
kerf watch --interval 5000     # slower refresh
```

### Pre-Flight Estimation — `kerf estimate`

Know what a task will cost before you start.

```bash
$ kerf estimate 'refactor auth module'

╭──────────────────────────────────────────────────────────╮
│  kerf-cli estimate: 'refactor auth module'               │
│                                                          │
│  Model: sonnet                                           │
│  Estimated turns: 15-40 (expected: 25)                   │
│  Context overhead: 62.7K tokens (ghost tokens)           │
│                                                          │
│  Estimated Cost:                                         │
│    Low:      $1.60    Expected: $2.62    High: $4.43     │
│                                                          │
│    -> Using Opus would cost ~$13.11 (5x more)            │
╰──────────────────────────────────────────────────────────╯
```

Compare all models side by side:

```bash
$ kerf estimate --compare 'add feature'

  Model      Turns          Low          Expected     High
  ----------------------------------------------------------
  sonnet     5-15           $0.67        $1.05        $1.45
  opus       5-15           $3.35        $5.24        $7.26
  haiku      5-15           $0.18        $0.28        $0.39

  Cheapest: haiku at $0.28
  Priciest: opus at $5.24
```

Task complexity is auto-detected from keywords:

| Complexity | Keywords | Estimated Turns |
|-----------|----------|-----------------|
| Simple | typo, rename, delete | 2-5 |
| Medium | fix, add, update | 5-15 |
| Complex | refactor, rewrite, build, implement, migrate | 15-40 |

```bash
kerf estimate 'fix bug' --model opus           # specific model
kerf estimate 'add auth' --files 'src/auth/*'   # with file context
kerf estimate 'fix bug' --json                  # JSON output
```

### Per-Project Budgets — `kerf budget`

Set spending limits with automatic warnings.

```bash
kerf budget set 50 --period weekly     # set budget
kerf budget show                        # check status
kerf budget list                        # all projects
kerf budget remove                      # remove budget
```

```
  kerf-cli budget

  Period:  weekly (2026-03-31 to 2026-04-06)
  Budget:  $50.00
  Spent:   $42.30
  [████████████████░░░░] 84.6%
```

With hooks installed, you get warnings at 80% and alerts at 100%.

### Ghost Token Audit — `kerf audit`

Find invisible token waste eating your context window.

```bash
$ kerf audit

  Context Window Health: B (62% usable)

  Ghost Token Breakdown:
    System prompt:     14,328 tokens (7.2%)
    Built-in tools:    15,000 tokens (7.5%)
    MCP tools (3 srv):  8,400 tokens (4.2%)
    CLAUDE.md:          2,100 tokens (1.1%)
    Autocompact buffer:33,000 tokens (16.5%)

  Recommendations:
    1. [HIGH] Reorder CLAUDE.md critical rules
    2. [MED] Disable unused 'playwright' MCP server
```

**Grades:** A (>70% usable) | B (50-70%) | C (30-50%) | D (<30%)

**Ghost tokens** are context consumed before your conversation starts: system prompt, built-in tools, MCP tools (~600 tokens each), CLAUDE.md, and autocompact buffer.

**CLAUDE.md attention curve:** Claude's attention is U-shaped. Rules at 0-30% and 70-100% get high attention. The 30-70% middle is a "dead zone." kerf flags critical rules (NEVER, ALWAYS, MUST) stuck there.

```bash
kerf audit --claude-md-only    # per-section breakdown with attention zones
kerf audit --mcp-only          # MCP server analysis
kerf audit --json              # machine-readable output
```

### Historical Reports — `kerf report`

Track spending over time with hourly charts and model breakdowns.

```bash
$ kerf report

  kerf-cli report -- Sat, Apr 4, 2026

  Total Cost:       $12.77
  Total Tokens:     906 in / 84.1K out
  Cache Hit Rate:   100.0%
  Sessions:         3

  Hourly:
    Apr 4, 2 AM    █████░░░░░░░ $2.27
    Apr 4, 1 PM    █░░░░░░░░░░░ $0.50
    Apr 4, 2 PM    ████░░░░░░░░ $1.75
    Apr 4, 6 PM    ████████████ $5.64
```

```bash
kerf report --period week       # weekly
kerf report --period month      # monthly
kerf report --sessions --model  # per-session + per-model breakdown
kerf report --csv > costs.csv   # export CSV
kerf report --json              # export JSON
```

### Hooks — Automatic Tracking

Claude Code hooks run automatically during sessions:

- **Notification hook:** Logs token usage to `~/.kerf/session-log.jsonl`
- **Stop hook:** Checks budget and warns at 80%, alerts at 100%

```bash
kerf init              # install hooks for current project
kerf init --global     # install globally
kerf init --no-hooks   # database only, skip hooks
```

---

## All Commands

| Command | Description |
|---------|-------------|
| `kerf watch` | Real-time cost dashboard (default) |
| `kerf estimate <task>` | Pre-flight cost estimation |
| `kerf estimate --compare <task>` | Compare Sonnet vs Opus vs Haiku |
| `kerf budget set <amt> --period weekly` | Set project budget |
| `kerf budget show` | Check budget status |
| `kerf budget list` | List all project budgets |
| `kerf budget remove` | Remove budget |
| `kerf audit` | Ghost token & CLAUDE.md audit |
| `kerf audit --claude-md-only` | CLAUDE.md section analysis |
| `kerf audit --mcp-only` | MCP server analysis |
| `kerf report` | Today's cost report |
| `kerf report --period week` | Weekly report |
| `kerf report --csv` | Export as CSV |
| `kerf init` | First-time setup |

> All commands work with both `kerf` and `kerf-cli`.

---

## Why kerf?

| Feature | kerf | RTK | ccusage | token-optimizer |
|---------|------|-----|---------|-----------------|
| Real-time dashboard | Yes | No | No | No |
| Pre-flight estimation | Yes | No | No | No |
| Per-project budgets | Yes | No | No | No |
| Ghost token audit | Yes | No | No | Partial |
| CLAUDE.md optimization | Yes | No | No | Yes |
| Historical reports | Yes | No | Yes | No |
| Hook-based tracking | Yes | No | No | No |

**RTK compresses. ccusage tracks. kerf predicts.**

Works alongside RTK, ccusage, and ECC.

---

## Tips

- **Use Sonnet for implementation, Opus for planning** — check with `kerf estimate --compare`
- **Keep CLAUDE.md under 200 lines** — audit with `kerf audit --claude-md-only`
- **Disable unused MCP servers** — each tool costs ~600 tokens
- **Monitor cache hit rate** — high rates (>80%) mean efficient context reuse
- **Set weekly budgets** — enough flexibility without runaway costs

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No active session found" | Ensure Claude Code is running and has sent a message |
| Dashboard shows no data | Send a message in Claude Code, wait for response |
| Costs seem wrong | kerf uses `total_cost_usd` from logs when available; estimates use heuristic |
| Command not found | Use `npx kerf-cli@latest` or `npm install -g kerf-cli` |
| Database errors | `rm ~/.kerf/kerf.db && kerf init` |
| Watch crashes | Must run in an interactive terminal, not piped |

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for project structure, design decisions, data flow, and technology choices.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

## Contributing

Contributions welcome! Please open an issue first.

```bash
git clone https://github.com/dhanushkumarsivaji/kerf-cli.git
cd kerf-cli
npm install
npm test
```

---

## License

[MIT](LICENSE) - Dhanush Kumar Sivaji
