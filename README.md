# kerf-cli

**Cost intelligence for Claude Code. Know before you spend.**

> *kerf (n.) — the width of material removed by a cutting tool. Every token operation has a kerf.*

[![npm version](https://img.shields.io/npm/v/kerf-cli)](https://www.npmjs.com/package/kerf-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-green.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)]()

```
┌──────────────────────────────────────────────────────────────┐
│  kerf watch | session: a3f8c2d1... | 47 messages  (q=quit)  │
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

## The Problem

> "20x Max plan exhausted in 19 minutes"

You don't know what you're spending until it's gone. Claude Code sessions burn through tokens fast — context overhead, MCP tools, bloated CLAUDE.md files — and there's no way to see it happening in real time.

**kerf-cli fixes that.**

---

## Quick Start

```bash
npx kerf-cli@latest init      # Set up hooks & database
npx kerf-cli@latest watch     # Real-time cost dashboard
npx kerf-cli@latest audit     # Find ghost token waste
```

---

## Features

### Real-Time Dashboard — `kerf watch`

Live cost monitoring while Claude Code runs. See your burn rate, context usage, and projected costs.

### Pre-Flight Estimation — `kerf estimate <task>`

Know the cost before you start.

```bash
$ npx kerf-cli estimate 'refactor auth module'

╭──────────────────────────────────────────────────────────╮
│  kerf estimate: 'refactor auth module'                   │
│                                                          │
│  Model: Sonnet 4                                         │
│  Estimated turns: 15-40 (expected: 25)                   │
│  Context overhead: 62.7K tokens (ghost tokens)           │
│                                                          │
│  Estimated Cost:                                         │
│    Low:      $2.10                                       │
│    Expected: $5.80                                       │
│    High:     $12.40                                      │
│                                                          │
│    -> Using Opus would cost ~$29.00 (5x more)            │
╰──────────────────────────────────────────────────────────╯
```

### Per-Project Budgets — `kerf budget`

Set spending limits and get warnings before you go over.

```bash
npx kerf-cli budget set 50 --period weekly
npx kerf-cli budget show
npx kerf-cli budget list
```

### Ghost Token Audit — `kerf audit`

Find and fix invisible token waste: system prompt overhead, MCP tool bloat, CLAUDE.md dead zones.

```bash
$ npx kerf-cli audit

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

### Historical Reports — `kerf report`

Track spending over time with per-model and per-session breakdowns.

```bash
npx kerf-cli report                  # Today's costs
npx kerf-cli report --period week    # Weekly summary
npx kerf-cli report --csv            # Export for spreadsheets
npx kerf-cli report --sessions       # Per-session breakdown
```

---

## Why kerf-cli?

| Feature | kerf-cli | RTK | ccusage | token-optimizer |
|---------|----------|-----|---------|-----------------|
| Real-time dashboard | Yes | No | No | No |
| Pre-flight estimation | Yes | No | No | No |
| Per-project budgets | Yes | No | No | No |
| Ghost token audit | Yes | No | No | Partial |
| CLAUDE.md optimization | Yes | No | No | Yes |
| Historical reports | Yes | No | Yes | No |
| Hook-based tracking | Yes | No | No | No |

**RTK compresses. ccusage tracks. kerf predicts.**

---

## Works With

- **RTK** — complementary (kerf-cli shows savings from RTK compression)
- **ccusage** — compatible (kerf-cli can import historical data)
- **ECC** — compatible hooks

---

## All Commands

| Command | Description |
|---------|-------------|
| `npx kerf-cli` / `npx kerf-cli watch` | Real-time cost dashboard (default) |
| `npx kerf-cli estimate <task>` | Pre-flight cost estimation |
| `npx kerf-cli budget set <amt>` | Set project budget |
| `npx kerf-cli budget show` | Show current budget status |
| `npx kerf-cli budget list` | List all project budgets |
| `npx kerf-cli audit` | Ghost token & CLAUDE.md audit |
| `npx kerf-cli audit --fix` | Auto-apply safe optimizations |
| `npx kerf-cli report` | Historical cost reports |
| `npx kerf-cli init` | Set up kerf (hooks, database) |

**Tip:** Add an alias for convenience:
```bash
echo 'alias kerf="npx kerf-cli"' >> ~/.zshrc
```

---

## Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/dhanushkumarsivaji/kerf-cli.git
cd kerf-cli
npm install
npm test
```

---

## License

[MIT](LICENSE) - Dhanush Kumar Sivaji
