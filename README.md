# kerf-cli

**The missing cost intelligence layer for Claude Code.**

> *kerf (n.) — the width of material removed by a cutting tool. Every token operation has a kerf.*

[![npm version](https://img.shields.io/npm/v/kerf-cli)](https://www.npmjs.com/package/kerf-cli)
[![CI](https://github.com/dhanushkumarsivaji/kerf-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/dhanushkumarsivaji/kerf-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-green.svg)]()

Kerf ingests your Claude Code sessions into a local SQLite database you can query with SQL. It runs analytics, surfaces wasted Opus spend, and can block Claude Code via hooks when you exceed a budget — preventing the $338 surprise bill.

```
$ kerf efficiency

  kerf efficiency report  (month)

  Estimated savings: $139.10 (71.7% of spend)
  if Opus traffic were routed to Sonnet for this month.

  Total spend: $193.87

  Model breakdown:
    opus       $173.88 (89.7% — 2538 msgs, 30 sessions) ##############################
    sonnet      $13.22 (6.8% — 365 msgs, 3 sessions) ##
    haiku        $6.78 (3.5% — 239 msgs, 21 sessions) #
```

---

## Quick Start

```bash
npm install -g kerf-cli

kerf sync             # ingest your existing Claude Code sessions into SQLite
kerf summary          # see what you spent today
kerf efficiency       # see how much you'd save by switching Opus to Sonnet
kerf budget set 50 --period weekly && kerf init --enforce-budgets
                      # set a $50 weekly budget that actually blocks overspend
```

---

## Why kerf?

ccusage is a great quick reporter. Kerf is what you reach for when you need:

- **a queryable analytics layer** — `kerf query "SELECT model, SUM(cost_usd) FROM messages GROUP BY model"`
- **real budget enforcement** — kerf installs a PreToolUse hook that blocks Claude Code when you're over budget, not just warns
- **cost-per-project attribution** — see exactly which projects burn the most tokens
- **model efficiency analysis** — surface the Opus spend that should have been Sonnet
- **cache hit rate visibility** — the 63% of cost hiding in cache misses
- **long-term history** — daily aggregates survive Claude Code's 30-day log deletion

Kerf parses `~/.claude/projects/*.jsonl` once into SQLite, then runs analytics in milliseconds. Local-only, no telemetry, no API keys.

---

## All Commands

### Analytics
| Command | Description |
|---------|-------------|
| `kerf sync` | Ingest Claude Code session JSONL into SQLite |
| `kerf summary` | Cost summary with `--period` `--model` `--by-project` |
| `kerf sessions` | List sessions, sort by cost/messages/duration |
| `kerf sessions <id>` | Inspect a single session in detail |
| `kerf query "<sql>"` | Read-only SQL over the analytics database |
| `kerf query --schema` | Print analytics schema |
| `kerf query --examples` | Useful example queries |
| `kerf efficiency` | Model usage analyzer with savings estimates |
| `kerf cache` | Cache hit rate analysis and savings |
| `kerf cache --poor-sessions` | Sessions with low cache utilization |

### Budgets & Enforcement
| Command | Description |
|---------|-------------|
| `kerf budget set <amt> --period weekly` | Set project budget |
| `kerf budget show` | Check current budget status |
| `kerf budget list` | List all project budgets |
| `kerf budget check` | Exit-code budget check (used by PreToolUse hook) |
| `kerf init --enforce-budgets` | Install PreToolUse hook that BLOCKS over-budget tool calls |

### Live Monitoring
| Command | Description |
|---------|-------------|
| `kerf watch` | Real-time cost dashboard for active session |
| `kerf estimate <task>` | Pre-flight cost estimation |
| `kerf estimate --compare <task>` | Compare Sonnet vs Opus vs Haiku |

### Optimization
| Command | Description |
|---------|-------------|
| `kerf audit` | Ghost token & CLAUDE.md audit |
| `kerf audit --fix` | Auto-reorder CLAUDE.md sections for attention |
| `kerf doctor` | Diagnose setup issues with actionable fixes |

### Setup
| Command | Description |
|---------|-------------|
| `kerf init` | First-time setup — creates DB, installs hooks |
| `kerf init --enforce-budgets` | Same + installs blocking PreToolUse hook |

> All commands work with both `kerf` and `kerf-cli`.

---

## SQL Queries

The analytics database has four tables: `messages`, `sessions_meta`, `ingest_state`, `daily_summaries`. Run `kerf query --schema` to see them.

```bash
# Top 10 most expensive projects
kerf query "SELECT project_path, ROUND(SUM(cost_usd), 2) as cost
            FROM messages GROUP BY project_path ORDER BY cost DESC LIMIT 10"

# Last 7 days by model
kerf query "SELECT model, ROUND(SUM(cost_usd), 2) as cost
            FROM messages WHERE timestamp > date('now', '-7 days')
            GROUP BY model ORDER BY cost DESC"

# Sessions over $5
kerf query "SELECT session_id, project_path, total_cost_usd
            FROM sessions_meta WHERE total_cost_usd > 5
            ORDER BY total_cost_usd DESC"
```

---

## Real Budget Enforcement

Most cost tools warn. Kerf blocks.

```bash
kerf budget set 10 --period daily
kerf init --enforce-budgets
```

After installing the PreToolUse hook, Claude Code asks kerf before every tool call. If you're over budget, kerf returns exit code 2 with a JSON `decision: "block"` — Claude Code stops before running the tool.

Default mode (without `--enforce-budgets`) is non-blocking: kerf surfaces a warning when you're over 80% but lets the session continue. Opt in to blocking when you're ready.

---

## Privacy

- **Local-only.** Data never leaves your machine. No telemetry. No remote logging.
- **No API key required.** Kerf reads `~/.claude/projects/` JSONLs directly.
- **Optional precise token counting** via `--precise` flag uses your `ANTHROPIC_API_KEY` (free count_tokens endpoint), but only for that one feature.
- **SQLite database at `~/.kerf/kerf.db`** — yours to inspect, query, back up, or delete.

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for project structure and design decisions.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

## Contributing

```bash
git clone https://github.com/dhanushkumarsivaji/kerf-cli.git
cd kerf-cli
npm install
npm test
```

Issues and PRs welcome. Please open an issue first to discuss any large changes.

---

## License

[MIT](LICENSE) - Dhanush Kumar Sivaji
