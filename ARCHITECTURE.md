# kerf-cli Architecture

## Overview

kerf-cli is a TypeScript CLI tool that provides cost intelligence for Claude Code. It parses Claude Code's JSONL session logs, calculates token costs, and presents the data through an interactive terminal UI.

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      kerf-cli                           │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌─────┐ │
│  │watch │ │esti- │ │budget│ │audit │ │report│ │init │ │
│  │      │ │mate  │ │      │ │      │ │      │ │     │ │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬──┘ │
├─────┼────────┼────────┼────────┼────────┼────────┼────┤
│     ▼        ▼        ▼        ▼        ▼        ▼    │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Core Engine Layer                   │   │
│  │  ┌────────┐ ┌──────────┐ ┌───────────────────┐ │   │
│  │  │ JSONL  │ │   Cost   │ │    Token          │ │   │
│  │  │ Parser │ │Calculator│ │   Counter         │ │   │
│  │  └────────┘ └──────────┘ └───────────────────┘ │   │
│  │  ┌────────┐ ┌──────────┐ ┌───────────────────┐ │   │
│  │  │Estimat-│ │  Budget  │ │   Cache           │ │   │
│  │  │  or    │ │ Manager  │ │  Analyzer         │ │   │
│  │  └────────┘ └──────────┘ └───────────────────┘ │   │
│  └─────────────────────────────────────────────────┘   │
├────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ ~/.claude/    │  │ ~/.kerf/    │  │  .claude/    │  │
│  │ projects/     │  │ kerf.db    │  │ settings.json│  │
│  │ *.jsonl       │  │ (SQLite)   │  │ (hooks)      │  │
│  └──────────────┘  └─────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────┘
```

## Project Structure

```
kerf-cli/
├── src/
│   ├── cli/                    # CLI layer
│   │   ├── index.ts            # Entry point (Commander.js)
│   │   ├── commands/
│   │   │   ├── watch.ts        # Real-time dashboard
│   │   │   ├── estimate.ts     # Pre-flight cost estimation
│   │   │   ├── budget.ts       # Budget management
│   │   │   ├── audit.ts        # Ghost token audit
│   │   │   ├── report.ts       # Historical reports
│   │   │   └── init.ts         # Setup & hook installation
│   │   └── ui/
│   │       ├── Dashboard.tsx   # Main Ink dashboard
│   │       ├── CostMeter.tsx   # Token burn rate gauge
│   │       ├── ContextBar.tsx  # Context window fill bar
│   │       ├── BudgetAlert.tsx # Budget threshold warnings
│   │       └── EstimateCard.tsx# Pre-flight estimate display
│   ├── core/                   # Business logic
│   │   ├── parser.ts           # JSONL session log parser
│   │   ├── costCalculator.ts   # Per-model pricing engine
│   │   ├── tokenCounter.ts     # Token counting + context overhead
│   │   ├── estimator.ts        # Pre-flight cost estimation
│   │   ├── budgetManager.ts    # SQLite budget CRUD
│   │   ├── cacheAnalyzer.ts    # Cache hit/miss analysis
│   │   └── config.ts           # Constants & configuration
│   ├── audit/                  # Audit modules
│   │   ├── ghostTokens.ts      # Ghost token overhead calculator
│   │   ├── claudeMdLinter.ts   # CLAUDE.md attention curve scorer
│   │   ├── mcpAnalyzer.ts      # MCP server token cost analysis
│   │   └── recommendations.ts  # Actionable optimization suggestions
│   ├── hooks/                  # Claude Code hook system
│   │   ├── templates/
│   │   │   ├── notification.sh # Token usage logger
│   │   │   └── stop.sh         # Budget enforcement
│   │   └── installer.ts        # Hook installation logic
│   ├── db/
│   │   ├── schema.ts           # SQLite schema & init
│   │   └── migrations.ts       # Database migrations
│   └── types/
│       ├── jsonl.ts            # JSONL log types
│       ├── pricing.ts          # Model pricing types
│       └── config.ts           # Config & audit types
├── tests/
│   ├── parser.test.ts
│   ├── costCalculator.test.ts
│   ├── estimator.test.ts
│   ├── tokenCounter.test.ts
│   └── fixtures/
│       ├── sample-session.jsonl
│       └── sample-claude-md.md
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

## Technology Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| CLI framework | Commander.js | Subcommand routing, option parsing |
| Terminal UI | Ink 5 (React 18) | Interactive dashboard with live updates |
| Database | better-sqlite3 | Synchronous access, fast for CLI tools |
| File watching | chokidar | Cross-platform file change detection |
| Dates | Day.js | Lightweight, immutable date operations |
| Colors | chalk | Terminal color output |
| Bundler | tsup | Fast ESM bundling with shebang support |
| Testing | vitest | Fast, ESM-native test runner |

## Key Design Decisions

### Token counting: heuristic over API

kerf-cli uses `characters / 3.5` as a fast local heuristic instead of calling the Anthropic token counting API. This keeps the tool instant and dependency-free. For actual session costs, it reads the authoritative `total_cost_usd` field from JSONL logs when available.

### Synchronous SQLite

`better-sqlite3` is used instead of async alternatives because CLI tools benefit from synchronous access — no event loop overhead, faster startup, simpler code.

### Multiply-then-divide cost calculation

To avoid floating point drift in financial calculations:
```typescript
const cost = (tokens * pricePerMillion) / 1_000_000;
```
When `total_cost_usd` is present in the JSONL, it's used as the authoritative source.

### JSONL message deduplication

Claude Code streams responses, producing intermediate JSONL entries with partial data (e.g., `output_tokens: 1`). The parser deduplicates by message ID, keeping the **last** occurrence for each ID to get final token counts.

### Context overhead constants

```
System prompt:      14,328 tokens (fixed)
Built-in tools:     15,000 tokens (fixed, 24 tools)
MCP tools:          ~600 tokens per tool (variable)
CLAUDE.md:          variable (parsed from file)
Autocompact buffer: 33,000 tokens (fixed)
Context window:     200,000 tokens total
```

### CLAUDE.md attention curve

Claude's attention follows a U-shaped curve across the context. kerf-cli maps each CLAUDE.md section to an attention zone:
- **0-30%:** High attention (top of file)
- **30-70%:** Low attention ("dead zone")
- **70-100%:** High attention (bottom of file)

Critical rules (NEVER, ALWAYS, MUST, CRITICAL) in the dead zone are flagged for reordering.

## Data Flow

### Watch command
```
~/.claude/projects/*.jsonl → parser.ts → costCalculator.ts → Dashboard.tsx
         ↑ chokidar watches        ↓ React state updates every 2s
```

### Estimate command
```
task description → estimator.ts → complexity detection → turn estimation
                         ↓
                  tokenCounter.ts → context overhead
                         ↓
                  costCalculator.ts → pricing per model
                         ↓
                  EstimateCard.tsx (or JSON output)
```

### Audit command
```
CLAUDE.md → claudeMdLinter.ts → section analysis + attention scoring
.mcp.json → mcpAnalyzer.ts   → tool count + token overhead
                    ↓
           ghostTokens.ts → total overhead + grade
                    ↓
           recommendations.ts → prioritized actions
```

## Model Pricing (as of May 2025)

| Model | Input | Output | Cache Read | Cache Creation |
|-------|-------|--------|------------|----------------|
| Sonnet 4 | $3/M | $15/M | $0.30/M | $3.75/M |
| Opus 4 | $15/M | $75/M | $1.50/M | $18.75/M |
| Haiku 4 | $0.80/M | $4/M | $0.08/M | $1.00/M |

## Key Paths

| Path | Purpose |
|------|---------|
| `~/.claude/projects/<encoded-path>/<session>.jsonl` | Claude Code session logs |
| `~/.claude/settings.json` | Global Claude Code settings & hooks |
| `.claude/settings.json` | Project-level settings & hooks |
| `.mcp.json` / `~/.claude.json` | MCP server configurations |
| `~/.kerf/kerf.db` | SQLite database (budgets, usage) |
| `~/.kerf/session-log.jsonl` | kerf-cli hook event log |
