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
kerf dashboard
```

> Both `kerf` and `kerf-cli` work as command names.

---

## The Problem

> "20x Max plan exhausted in 19 minutes"

Claude Code sessions burn through tokens fast — context overhead, MCP tools, bloated CLAUDE.md files — and there's no way to see it in real time. **36% of your 200K context window is consumed by invisible ghost tokens before you even start typing.** kerf gives you visibility with live dashboards, smart estimates, budgets, ghost token auditing, and a web dashboard.

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

Creates `~/.kerf/` directory, initializes the SQLite database, and installs Claude Code hooks for automatic token tracking and budget enforcement.

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
kerf estimate 'refactor the auth module'    # what will it cost?
kerf estimate --compare 'build dashboard'   # sonnet vs opus vs haiku
kerf budget show                             # how's my budget?
```

### End-of-day review

```bash
kerf report                  # today's spending
kerf report --sessions       # per-session breakdown
kerf dashboard               # visual charts in browser
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

### Smart Cost Estimation — `kerf estimate`

Know what a task will cost before you start. Uses multi-signal complexity scoring: keywords, file sizes, file count, and description length.

```bash
$ kerf estimate 'refactor auth module'

╭──────────────────────────────────────────────────────────╮
│  kerf-cli estimate: 'refactor auth module'               │
│                                                          │
│  Model: sonnet                                           │
│  Complexity: complex (score: 0.75)                       │
│    keywords:0.9 files:0.6 count:0.4 desc:0.5            │
│  Estimated turns: 16-50 (expected: 31)                   │
│  Files: 12 file(s), 16.7K tokens                         │
│  Context overhead: 62.8K tokens (ghost tokens)           │
│  Tool overhead: ~99.2K tokens (4 calls/turn)             │
│                                                          │
│  Estimated Cost:                                         │
│    Low:      $1.78                                       │
│    Expected: $3.33                                       │
│    High:     $5.66                                       │
│                                                          │
│  Token counting: heuristic (set ANTHROPIC_API_KEY        │
│    for precise counts)                                   │
│  Window Usage: ~22% of 5-hour window                     │
│    -> Using Opus would cost ~$16.65 (5.0x more)          │
╰──────────────────────────────────────────────────────────╯
```

Compare all models side by side:

```bash
$ kerf estimate --compare 'build authentication system'

  kerf-cli estimate: 'build authentication system'
  Complexity: complex (score: 0.75)

  Model      Turns          Low          Expected     High
  ----------------------------------------------------------
  sonnet     16-50          $1.78        $3.33        $5.66
  opus       16-50          $8.90        $16.65       $28.28
  haiku      16-50          $0.47        $0.89        $1.51

  Cheapest: haiku at $0.89
  Priciest: opus at $16.65
```

The estimator analyzes multiple signals to determine complexity:

| Signal | Weight (with files) | Weight (no files) | What it measures |
|--------|--------------------|--------------------|------------------|
| Keywords | 35% | 60% | Task type (typo vs refactor vs build) |
| File size | 30% | — | Total tokens in target files |
| File count | 20% | — | Number of files to touch |
| Description | 15% | 40% | Word count of task description |

```bash
kerf estimate 'fix bug' --model opus              # specific model
kerf estimate 'add auth' --files 'src/auth/*'      # with file context
kerf estimate 'refactor' --precise                 # Anthropic API token counts
kerf estimate 'fix bug' --json                     # JSON output
```

### Per-Project Budgets — `kerf budget`

Set spending limits with automatic warnings via hooks.

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

Budget data is synced automatically from JSONL session logs. With hooks installed, you get warnings at 80% and alerts at 100%.

### Ghost Token Audit — `kerf audit`

Find invisible token waste eating your context window. Auto-fix CLAUDE.md with `--fix`.

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

**CLAUDE.md attention curve:** Claude's attention follows a U-shape. Rules at 0-30% and 70-100% get high attention. The 30-70% middle is a "dead zone." kerf flags critical rules (NEVER, ALWAYS, MUST) stuck there and can auto-fix the ordering.

```bash
kerf audit --claude-md-only    # per-section breakdown with attention zones
kerf audit --mcp-only          # MCP server analysis
kerf audit --fix               # auto-reorder CLAUDE.md (creates backup)
kerf audit --json              # machine-readable output
```

### Historical Reports — `kerf report`

Track spending over time with hourly charts and model breakdowns.

```bash
$ kerf report

  kerf-cli report -- Sat, Apr 5, 2026

  Total Cost:       $12.77
  Total Tokens:     906 in / 84.1K out
  Cache Hit Rate:   100.0%
  Sessions:         3

  Hourly:
    Apr 5, 9 AM    █████░░░░░░░ $2.27
    Apr 5, 10 AM   █░░░░░░░░░░░ $0.50
    Apr 5, 11 AM   ████░░░░░░░░ $1.75
    Apr 5, 2 PM    ████████████ $5.64
```

```bash
kerf report --period week       # weekly
kerf report --period month      # monthly
kerf report --sessions --model  # per-session + per-model breakdown
kerf report --csv > costs.csv   # export CSV
kerf report --json              # export JSON
```

### Data Import — `kerf import`

Sync all historical session data into the budget tracking database.

```bash
$ kerf import --dry-run

  kerf-cli import

  (dry run — no data written)

  Sessions processed: 48
  Messages imported:  2939
  Total cost:         $160.96
```

```bash
kerf import                        # import all sessions
kerf import --since 2026-03-01     # only recent data
kerf import --dry-run              # preview without writing
```

### Web Dashboard — `kerf dashboard`

Open a React dashboard in your browser with interactive charts and analytics.

```bash
kerf dashboard              # opens http://localhost:3847
kerf dashboard --port 8080  # custom port
kerf dashboard --no-open    # start server without opening browser
```

Features: cost over time area chart, metric cards, session table, ghost token breakdown, period selector (today/week/month), auto-refresh every 10 seconds, CSV export. Dark theme with cyan accents.

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
| `kerf estimate <task>` | Smart pre-flight cost estimation |
| `kerf estimate --compare <task>` | Compare Sonnet vs Opus vs Haiku |
| `kerf estimate --precise <task>` | Accurate token counts via Anthropic API |
| `kerf budget set <amt> --period weekly` | Set project budget |
| `kerf budget show` | Check budget status |
| `kerf budget list` | List all project budgets |
| `kerf budget remove` | Remove budget |
| `kerf audit` | Ghost token & CLAUDE.md audit |
| `kerf audit --claude-md-only` | CLAUDE.md section analysis with attention zones |
| `kerf audit --mcp-only` | MCP server analysis |
| `kerf audit --fix` | Auto-reorder CLAUDE.md for optimal attention |
| `kerf report` | Today's cost report |
| `kerf report --period week` | Weekly report |
| `kerf report --csv` | Export as CSV |
| `kerf import` | Sync historical data to budget DB |
| `kerf import --dry-run` | Preview import without writing |
| `kerf dashboard` | Web dashboard at localhost:3847 |
| `kerf init` | First-time setup (database + hooks) |

> All commands work with both `kerf` and `kerf-cli`.

---

## Why kerf?

| Feature | kerf | RTK | ccusage | token-optimizer |
|---------|------|-----|---------|-----------------|
| Real-time dashboard | Yes | No | No | No |
| Web dashboard | Yes | No | No | No |
| Smart cost estimation | Yes | No | No | No |
| Per-project budgets | Yes | No | No | No |
| Ghost token audit | Yes | No | No | Partial |
| CLAUDE.md auto-fix | Yes | No | No | No |
| Historical reports | Yes | No | Yes | No |
| Data import | Yes | No | No | No |
| Hook-based tracking | Yes | No | No | No |
| Anthropic API counting | Yes | No | No | No |

**RTK compresses. ccusage tracks. kerf predicts.**

Works alongside RTK, ccusage, and ECC.

---

## Tips

- **Use Sonnet for implementation, Opus for planning** — check with `kerf estimate --compare`
- **Keep CLAUDE.md under 200 lines** — audit with `kerf audit --claude-md-only`
- **Auto-fix CLAUDE.md ordering** — run `kerf audit --fix` to move critical rules out of the dead zone
- **Disable unused MCP servers** — each tool costs ~600 tokens of context
- **Monitor cache hit rate** — high rates (>80%) mean efficient context reuse
- **Set weekly budgets** — enough flexibility without runaway costs
- **Import historical data** — run `kerf import` to backfill your budget tracking
- **Set ANTHROPIC_API_KEY** — enables precise token counting with `--precise`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No active session found" | Ensure Claude Code is running and has sent a message |
| Dashboard shows no data | Send a message in Claude Code, wait for response |
| Costs seem wrong | kerf uses `total_cost_usd` from logs when available; estimates use heuristic |
| Want precise token counts | Set `ANTHROPIC_API_KEY` env var, use `--precise` flag |
| Command not found | Use `npx kerf-cli@latest` or `npm install -g kerf-cli` |
| Database errors | `rm ~/.kerf/kerf.db && kerf init` |
| Watch crashes | Must run in an interactive terminal, not piped |
| Budget shows $0 | Run `kerf import` to sync session data into budget DB |

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
