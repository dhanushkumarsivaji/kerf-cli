# kerf-cli Architecture

## Overview

kerf-cli is a TypeScript CLI tool that provides cost intelligence for AI coding agents. It ingests session logs from multiple tools (Claude Code, Codex CLI, plus external/OpenTelemetry sources) through a pluggable **adapter layer**, normalizes them into one shape, stores them in a local tool-tagged SQLite database, and presents the data through CLI commands, a web dashboard, SQL queries, and live hooks.

### Adapter layer

Each supported tool has an adapter (`src/adapters/`) implementing a single contract (`IngestAdapter`): detect whether the tool is installed, discover its session files, parse one session into the normalized `ParsedSession` shape, and resolve its project path. The `IngestService` is tool-agnostic — it drives every available adapter, stamps each row with the adapter's `tool` id, and the rest of kerf (summary, efficiency, cache, query, dashboard) works across all tools automatically. Adding a tool means adding an adapter and registering it; nothing downstream changes.

Bulk sources that don't fit the one-file-one-session model — external additions (`~/.kerf/external-additions.json` for Cursor/Copilot/etc.) and OpenTelemetry logs (`~/.kerf/otel-sources.json`) — are parsed into the same `ParsedSession` shape and ingested through the shared `writeSession` path.

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
│   ├── adapters/               # Pluggable per-tool ingest layer
│   │   ├── types.ts            # IngestAdapter contract + AdapterSessionFile
│   │   ├── registry.ts         # getAdapters() / getAdapterById()
│   │   ├── claudeCode.ts       # Claude Code adapter (~/.claude/projects)
│   │   ├── codex.ts            # Codex CLI adapter (~/.codex/sessions)
│   │   ├── external.ts         # external-additions.json (Cursor/Copilot/…)
│   │   └── otel.ts             # OpenTelemetry GenAI log sources
│   ├── cli/                    # CLI layer
│   │   ├── index.ts            # Entry point (Commander.js)
│   │   ├── commands/
│   │   │   ├── sync.ts         # Adapter-driven ingest (--tool filter)
│   │   │   ├── summary.ts      # Cost summary (--by-tool, --tool)
│   │   │   ├── sessions.ts     # Session list/detail (Tool column)
│   │   │   ├── efficiency.ts   # Model + cross-tool optimization
│   │   │   ├── cache.ts        # Cache hit-rate analysis
│   │   │   ├── forecast.ts     # Spend projection
│   │   │   ├── watch.ts        # Real-time dashboard (--alerts)
│   │   │   ├── monitor.ts      # Headless anomaly alerts
│   │   │   ├── estimate.ts     # Pre-flight cost estimation
│   │   │   ├── budget.ts       # Budget management
│   │   │   ├── audit.ts        # Ghost token audit
│   │   │   ├── report.ts       # Historical reports
│   │   │   ├── query.ts        # Read-only SQL
│   │   │   ├── import.ts       # Budget + external import
│   │   │   └── init.ts         # Setup & hook installation
│   │   └── ui/
│   │       ├── Dashboard.tsx   # Main Ink dashboard
│   │       ├── CostMeter.tsx   # Token burn rate gauge
│   │       ├── ContextBar.tsx  # Context window fill bar
│   │       ├── BudgetAlert.tsx # Budget threshold warnings
│   │       └── EstimateCard.tsx# Pre-flight estimate display
│   ├── core/                   # Business logic
│   │   ├── parser.ts           # Claude Code JSONL parser
│   │   ├── ingest.ts           # Adapter-driven SQLite ingest (writeSession)
│   │   ├── costCalculator.ts   # Per-model pricing (Claude, OpenAI, Gemini)
│   │   ├── tokenCounter.ts     # Token counting + context overhead
│   │   ├── estimator.ts        # Pre-flight cost estimation
│   │   ├── forecaster.ts       # Week/month spend projection
│   │   ├── anomalyDetector.ts  # Cost-spike / cache-drop detection
│   │   ├── alerts.ts           # Alert dispatch (terminal/desktop/webhook)
│   │   ├── efficiencyAnalyzer.ts   # Model distribution + savings
│   │   ├── crossToolAnalyzer.ts    # Cross-tool optimization recs
│   │   ├── cacheReporter.ts    # Cache hit/miss analysis
│   │   ├── budgetManager.ts    # SQLite budget CRUD
│   │   └── config.ts           # Constants, paths & alert config
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

## Model Pricing

Per-million-token USD rates live in `MODEL_PRICING` (`src/core/costCalculator.ts`). `resolveModelPricing` matches by exact name, then by prefix (so `gpt-5.4` → `gpt-5`), falling back to Sonnet. **Verify provider rates before each release** — they change.

| Model | Input | Output | Cache Read | Cache Creation |
|-------|-------|--------|------------|----------------|
| Sonnet 4 | $3/M | $15/M | $0.30/M | $3.75/M |
| Opus 4 | $15/M | $75/M | $1.50/M | $18.75/M |
| Haiku 4 | $0.80/M | $4/M | $0.08/M | $1.00/M |
| gpt-5 / gpt-5-codex | $1.25/M | $10/M | $0.125/M | $1.25/M |
| gpt-5-mini | $0.25/M | $2/M | $0.025/M | $0.25/M |
| o4-mini | $1.10/M | $4.40/M | $0.275/M | $1.10/M |
| gemini-2.5-pro | $1.25/M | $10/M | $0.125/M | $1.25/M |
| gemini-2.5-flash | $0.30/M | $2.50/M | $0.03/M | $0.30/M |

OpenAI/Codex report `input_tokens` inclusive of the cached portion; adapters split that into uncached input + `cache_read` so cost math matches each provider's billing.

## Key Paths

| Path | Purpose |
|------|---------|
| `~/.claude/projects/<encoded-path>/<session>.jsonl` | Claude Code session logs |
| `~/.codex/sessions/**/rollout-*.jsonl` | Codex CLI session logs (`CODEX_HOME` overrides) |
| `~/.claude/settings.json` | Global Claude Code settings & hooks |
| `.claude/settings.json` | Project-level settings & hooks |
| `.mcp.json` / `~/.claude.json` | MCP server configurations |
| `~/.kerf/kerf.db` | SQLite database (budgets, usage; `tool`-tagged) |
| `~/.kerf/config.json` | Alert configuration |
| `~/.kerf/external-additions.json` | External usage import (Cursor/Copilot/…) |
| `~/.kerf/otel-sources.json` | OpenTelemetry log source mapping |
| `~/.kerf/session-log.jsonl` | kerf-cli hook event log |
