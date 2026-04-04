# ⚒️ kerf — Claude Code Implementation Guide
## Step-by-Step Claude Code Commands to Build the Complete Project

> **What is kerf?** The width of material removed by a cutting tool. Every token operation has a kerf — the waste of each cut. **kerf** is a TypeScript CLI tool that provides real-time cost intelligence for Claude Code — pre-flight estimation, live token dashboards, per-project budgets, and CLAUDE.md optimization. Distributed via `npx kerf@latest`.

---

## Phase 0: Project Scaffolding (Session 1)

### Step 1: Initialize the monorepo

```
claude "Create a new TypeScript project called 'kerf' with the following structure:

kerf/
├── src/
│   ├── cli/              # CLI entry point and subcommands
│   │   ├── index.ts      # Main CLI entry (Commander.js)
│   │   ├── commands/
│   │   │   ├── watch.ts      # Real-time dashboard command
│   │   │   ├── estimate.ts   # Pre-flight cost estimation
│   │   │   ├── budget.ts     # Per-project budget management
│   │   │   ├── audit.ts      # Ghost token & CLAUDE.md audit
│   │   │   ├── init.ts       # Install hooks & configure
│   │   │   └── report.ts     # Historical cost reports
│   │   └── ui/
│   │       ├── Dashboard.tsx      # Main Ink dashboard component
│   │       ├── CostMeter.tsx      # Token burn rate gauge
│   │       ├── ContextBar.tsx     # Context window fill indicator
│   │       ├── BudgetAlert.tsx    # Budget threshold warnings
│   │       └── EstimateCard.tsx   # Pre-flight estimate display
│   ├── core/
│   │   ├── parser.ts         # JSONL session log parser
│   │   ├── tokenCounter.ts   # Token counting (heuristic + API)
│   │   ├── costCalculator.ts # Per-model pricing engine
│   │   ├── estimator.ts      # Pre-flight cost estimation logic
│   │   ├── budgetManager.ts  # SQLite budget tracking
│   │   ├── cacheAnalyzer.ts  # Prompt cache hit/miss analysis
│   │   └── config.ts         # Configuration management
│   ├── audit/
│   │   ├── ghostTokens.ts    # Ghost token overhead calculator
│   │   ├── claudeMdLinter.ts # CLAUDE.md attention curve scorer
│   │   ├── mcpAnalyzer.ts    # MCP server token cost analysis
│   │   └── recommendations.ts # Actionable optimization suggestions
│   ├── hooks/
│   │   ├── templates/
│   │   │   ├── pre-tool-use.sh    # PreToolUse hook template
│   │   │   ├── post-tool-use.sh   # PostToolUse hook template
│   │   │   ├── stop.sh            # Stop hook for budget enforcement
│   │   │   └── notification.sh    # Notification hook for alerts
│   │   └── installer.ts      # Hook installation logic
│   ├── db/
│   │   ├── schema.ts         # SQLite schema definitions
│   │   └── migrations.ts     # Database migrations
│   └── types/
│       ├── jsonl.ts          # JSONL log type definitions
│       ├── pricing.ts        # Model pricing types
│       └── config.ts         # Config type definitions
├── tests/
│   ├── parser.test.ts
│   ├── costCalculator.test.ts
│   ├── estimator.test.ts
│   └── fixtures/
│       └── sample-session.jsonl
├── package.json
├── tsconfig.json
├── tsup.config.ts        # Build config (tsup bundler)
├── .github/
│   └── workflows/
│       └── ci.yml
├── CLAUDE.md
├── README.md
└── LICENSE               # MIT

Use these exact dependency versions in package.json (pin exact, no ^ or ~):
- commander: 13.1.0
- ink: 5.2.0
- react: 18.3.1
- better-sqlite3: 11.9.1
- chokidar: 4.0.3
- chalk: 5.4.1
- ora: 8.2.0
- glob: 11.0.1
- dayjs: 1.11.13

DevDependencies:
- typescript: 5.8.3
- tsup: 8.4.0
- @types/react: 18.3.18
- @types/better-sqlite3: 7.6.14
- @types/node: 22.12.0
- vitest: 3.0.5
- @types/ink: use ink's built-in types
- ink-testing-library: 4.0.0

Set package.json name to 'kerf'.
Set package.json bin field to: { 'kerf': './dist/cli/index.js' }
Set type to 'module'.
Set description to: 'Cost intelligence for Claude Code. Know before you spend.'
Set keywords to: ['claude-code', 'token-optimization', 'cost-intelligence', 'developer-tools', 'cli', 'kerf']
Add scripts: build, dev, test, lint, prepublishOnly.
tsup should bundle src/cli/index.ts as the entry with ESM format.
"
```

### Step 2: Create the CLAUDE.md for the project

```
claude "Create a CLAUDE.md file for this project with the following content:

# kerf — Claude Code Cost Intelligence

## Project Overview
TypeScript CLI tool providing real-time cost intelligence for Claude Code.
Name origin: kerf = width of material removed by a cutting tool (token waste).
Distributed via npx. Uses Ink (React for CLI) for terminal UI.

## Architecture
- CLI: Commander.js for subcommands, Ink for interactive UI
- Data: Parse JSONL from ~/.claude/projects/, SQLite for budgets
- Hooks: Shell scripts installed to ~/.claude/hooks/
- Token counting: character/3.5 heuristic, Anthropic count_tokens API optional
- Storage: ~/.kerf/kerf.db (SQLite), ~/.kerf/session-log.jsonl

## Conventions
- Use Day.js for all date operations (not Moment.js)
- Pin exact versions in package.json (no ^ or ~)
- Use structlog pattern for logging (structured JSON)
- All financial values use string-based precision (avoid floating point)
- ESM modules only (type: module in package.json)
- Prefer named exports over default exports
- Error messages must be actionable (tell user what to do)

## Key Paths
- JSONL logs: ~/.claude/projects/<encoded-path>/<session>.jsonl
- Settings: ~/.claude/settings.json (global), .claude/settings.json (project)
- MCP config: .mcp.json (project), ~/.claude.json (user)
- Hooks: ~/.claude/settings.json hooks[] array
- kerf data: ~/.kerf/kerf.db, ~/.kerf/session-log.jsonl

## Testing
- vitest for all tests
- Fixtures in tests/fixtures/
- Mock JSONL data for parser tests

## Build
- tsup bundles to dist/
- npm prepublishOnly runs build
- Target: Node 20+
"
```

---

## Phase 1: JSONL Parser & Cost Calculator (Session 2)

### Step 3: Build the JSONL log parser

```
claude "Build the JSONL session log parser in src/core/parser.ts.

Requirements:
1. Find all JSONL files in ~/.claude/projects/ recursively
2. Parse each line as JSON, handling malformed lines gracefully
3. Extract from each assistant message:
   - usage.input_tokens
   - usage.output_tokens
   - usage.cache_creation_input_tokens
   - usage.cache_read_input_tokens
   - message.model (e.g. 'claude-sonnet-4-20250514')
   - timestamp
   - session_id (from filename)
   - total_cost_usd (if present, use as authoritative)
4. Handle the known bug where output_tokens shows intermediate streaming values (output_tokens: 1). Deduplicate by message id — take the LAST occurrence for each id.
5. Support streaming parse for live monitoring (use readline + chokidar file watcher)
6. Export types: SessionData, MessageUsage, ParsedSession
7. Add a getActiveSessions() function that finds sessions modified in the last 5 hours (matches Claude Code billing window)

Use Day.js for all date operations. Write comprehensive vitest tests with a fixture JSONL file in tests/fixtures/sample-session.jsonl that includes realistic token counts.
"
```

### Step 4: Build the cost calculator

```
claude "Build the cost calculator in src/core/costCalculator.ts.

Requirements:
1. Define pricing per model (per million tokens):
   - claude-sonnet-4-20250514: input=$3, output=$15, cache_read=$0.30, cache_creation=$3.75
   - claude-opus-4-20250514: input=$15, output=$75, cache_read=$1.50, cache_creation=$18.75
   - claude-haiku-4-20250514: input=$0.80, output=$4, cache_read=$0.08, cache_creation=$1.00
   (Make this a config object so it's easy to update when pricing changes)

2. Calculate cost per message:
   cost = (input_tokens * input_price / 1M) +
          (output_tokens * output_price / 1M) +
          (cache_read_input_tokens * cache_read_price / 1M) +
          (cache_creation_input_tokens * cache_creation_price / 1M)

3. If total_cost_usd is present in the JSONL, use that instead (it's authoritative)

4. Aggregate costs by: session, hour, day, 5-hour billing window, week, month
5. Calculate cost velocity ($/minute burn rate) from recent messages
6. Project remaining budget for current 5-hour window based on velocity

Use string-based arithmetic or multiply-then-divide pattern to avoid floating point issues. Add vitest tests comparing calculated costs against known fixtures.
"
```

### Step 5: Build the token counter

```
claude "Build the token counter in src/core/tokenCounter.ts.

Requirements:
1. Implement a fast local heuristic: tokens ≈ characters / 3.5
   This is for instant estimates without API calls.

2. Implement file-based token counting:
   - Read a file, apply the heuristic
   - Support .md, .ts, .js, .json, .yaml, .py, .txt

3. Implement CLAUDE.md token analysis:
   - Parse CLAUDE.md by sections (split on ## headers)
   - Count tokens per section
   - Calculate total startup overhead
   - Flag sections over 500 tokens as 'heavy'

4. Implement settings.json analysis:
   - Parse MCP server configurations
   - Estimate tokens per MCP tool (avg 400-800 tokens per tool, use 600 as default)
   - Calculate total MCP overhead

5. Export a function estimateContextOverhead() that returns:
   {
     systemPrompt: ~14328,  // fixed overhead
     builtInTools: ~15000,  // fixed overhead (24 tools)
     claudeMd: number,      // calculated from file
     mcpTools: number,      // calculated from config
     autocompactBuffer: ~33000, // reserved
     totalOverhead: number,
     effectiveWindow: number, // 200000 - totalOverhead
     percentUsable: number
   }

Write vitest tests.
"
```

---

## Phase 2: Real-Time Dashboard (Session 3)

### Step 6: Build the Ink dashboard components

```
claude "Build the Ink (React for CLI) dashboard components in src/cli/ui/.

1. Dashboard.tsx — Main layout component:
   - Uses Ink's Box and Text components
   - Three-panel layout: top (cost meter), middle (context bar), bottom (session log)
   - Refreshes every 2 seconds by polling JSONL files
   - Shows current model being used
   - Keyboard shortcuts: q=quit, r=refresh, b=toggle budget view

2. CostMeter.tsx — Token burn rate display:
   - Shows: tokens used / estimated window budget
   - Color-coded: green (<50%), yellow (50-80%), red (>80%)
   - Displays $/minute burn rate
   - Shows projected time until window exhaustion
   - Format: '🔥 $2.34 / ~$15.00 window │ $0.12/min │ ~1h 45m remaining'

3. ContextBar.tsx — Context window fill indicator:
   - ASCII progress bar showing context utilization
   - Color transitions: green → yellow → red
   - Shows: '[████████░░░░░░░░░░░░] 42% │ 84K / 200K tokens'
   - Marks ghost token overhead in a different color (dim)
   - Shows breakdown: system(14K) + tools(15K) + mcp(8K) + conversation(47K)

4. BudgetAlert.tsx — Budget threshold component:
   - Shows project budget vs actual spend
   - Flashes/blinks when over 80% threshold
   - Format: '💰 Project: dk-ai-trader │ Budget: $50/week │ Spent: $42.30 (84%)'

5. EstimateCard.tsx — Pre-flight estimate display:
   - Shows estimated cost range for a task
   - Compares Sonnet vs Opus cost
   - Format: '📊 Estimated: 15-25K tokens │ $0.45-$0.75 (Sonnet) │ $2.25-$3.75 (Opus)'

Use Ink 5 with React 18. Use chalk for colors. All components should be functional components with React hooks (useState, useEffect). Import { useState, useEffect } from 'react' and { Box, Text, useInput, useApp } from 'ink'.
"
```

### Step 7: Wire up the watch command

```
claude "Build the watch command in src/cli/commands/watch.ts.

Requirements:
1. When user runs 'kerf watch' or 'kerf' (default command):
   - Find the most recently modified JSONL session in ~/.claude/projects/
   - Start the Ink Dashboard component with live data
   - Use chokidar to watch the JSONL file for changes
   - On each file change, re-parse the last N lines (incremental, not full re-parse)
   - Update the dashboard components via React state

2. Options:
   --session <id>    Watch a specific session
   --project <path>  Watch sessions for a specific project
   --interval <ms>   Polling interval (default: 2000)
   --no-color        Disable colors

3. Graceful shutdown on Ctrl+C

4. If no active session is found, show a helpful message:
   'No active Claude Code session found. Start Claude Code and run kerf watch again.'

Wire this into the main CLI in src/cli/index.ts using Commander.js. Make 'watch' the default command (runs when no subcommand given).
"
```

---

## Phase 3: Pre-flight Cost Estimation (Session 4)

### Step 8: Build the estimation engine

```
claude "Build the pre-flight cost estimation engine in src/core/estimator.ts.

Requirements:
1. estimateTaskCost(taskDescription: string, options: EstimateOptions): CostEstimate

2. EstimateOptions:
   - model: 'sonnet' | 'opus' | 'haiku' (default: 'sonnet')
   - files: string[]  // files that will be touched
   - cwd: string      // project root

3. The estimator should:
   a. Count tokens in the specified files (or auto-detect from git status if no files given)
   b. Estimate conversation turns based on task complexity heuristics:
      - Simple (typo fix, rename): 2-5 turns
      - Medium (bug fix, add feature): 5-15 turns
      - Complex (refactor, new module): 15-40 turns
      - Use keyword detection: 'refactor' → complex, 'fix typo' → simple, etc.
   c. Calculate per-turn cost:
      - Input: context_overhead + file_tokens + conversation_history_growth
      - Output: estimated ~2000 tokens/turn average (code + explanation)
      - Cache: assume 90% cache hit rate after turn 2
   d. Apply model pricing
   e. Return range (low, expected, high) with 0.5x and 1.5x multipliers

4. CostEstimate type:
   {
     model: string,
     estimatedTurns: { low: number, expected: number, high: number },
     estimatedTokens: { input: number, output: number, cached: number },
     estimatedCost: { low: string, expected: string, high: string },
     contextOverhead: number,
     fileTokens: number,
     percentOfWindow: number,  // estimated % of 5-hour window
     recommendations: string[] // e.g. 'Consider Sonnet to save $X'
   }

5. Compare Sonnet vs Opus cost in recommendations

Write vitest tests with realistic scenarios.
"
```

### Step 9: Build the estimate command

```
claude "Build the estimate command in src/cli/commands/estimate.ts.

Requirements:
1. 'kerf estimate <task>' — Estimate cost before starting work
   Examples:
   - kerf estimate 'refactor auth module'
   - kerf estimate 'fix typo in README'
   - kerf estimate --files src/auth/*.ts 'add rate limiting'

2. Options:
   --model <model>   Model to estimate for (default: sonnet)
   --files <glob>    Specific files that will be touched
   --compare         Show Sonnet vs Opus vs Haiku comparison table
   --json            Output as JSON (for scripting)

3. Display using the EstimateCard Ink component:

   ┌─────────────────────────────────────────────────┐
   │ ⚒️  kerf estimate: 'refactor auth module'       │
   ├─────────────────────────────────────────────────┤
   │ Model: Sonnet 4                                  │
   │ Estimated turns: 15-25 (expected: 20)            │
   │ Files: 8 files, ~12,400 tokens                   │
   │ Context overhead: ~37,000 tokens (ghost tokens)  │
   │                                                  │
   │ Estimated Cost:                                  │
   │   Low:      $0.85                                │
   │   Expected: $1.70                                │
   │   High:     $2.55                                │
   │                                                  │
   │ Window Usage: ~11% of 5-hour window              │
   │                                                  │
   │ 💡 Using Opus would cost ~$8.50 (5x more)       │
   └─────────────────────────────────────────────────┘

Wire into the main CLI.
"
```

---

## Phase 4: Budget Management (Session 5)

### Step 10: Build the SQLite budget system

```
claude "Build the budget management system in src/core/budgetManager.ts and src/db/.

Requirements:
1. SQLite schema (src/db/schema.ts):
   - projects table: id, name, path, created_at
   - budgets table: id, project_id, amount_usd, period ('daily'|'weekly'|'monthly'), created_at
   - usage_snapshots table: id, project_id, tokens_in, tokens_out, cost_usd, timestamp

2. BudgetManager class:
   - setBudget(projectPath, amount, period): Set budget for a project
   - getBudget(projectPath): Get current budget config
   - getUsage(projectPath, period): Get usage for current period
   - checkBudget(projectPath): Returns { budget, spent, remaining, percentUsed, isOverBudget }
   - listProjects(): Show all projects with budgets
   - removeBudget(projectPath): Remove budget for a project

3. Store the SQLite database at ~/.kerf/kerf.db
4. Auto-create database and tables on first use
5. Sync usage from JSONL files on each check (incremental — only process new entries)

Use better-sqlite3 for synchronous SQLite access (faster than async for CLI tools).
Use Day.js for period calculations (start of week, start of month, etc.).
"
```

### Step 11: Build the budget command

```
claude "Build the budget command in src/cli/commands/budget.ts.

Requirements:
1. Subcommands:
   - kerf budget set <amount> --period weekly    # Set budget for current project
   - kerf budget set <amount> --project <path>   # Set for specific project
   - kerf budget show                             # Show current project budget
   - kerf budget list                             # List all project budgets
   - kerf budget remove                           # Remove current project budget

2. Display:
   ┌─────────────────────────────────────────────────┐
   │ ⚒️  kerf budget: dk-ai-trader                   │
   ├─────────────────────────────────────────────────┤
   │ Period: Weekly (resets Monday)                   │
   │ Budget: $50.00                                  │
   │ Spent:  $42.30                                  │
   │ [████████████████░░░░] 84.6%                    │
   │                                                 │
   │ Daily breakdown:                                │
   │   Mon: $8.20  Tue: $12.50  Wed: $15.30         │
   │   Thu: $6.30  Today: $0.00                     │
   │                                                 │
   │ ⚠️  On track to exceed budget by Thursday       │
   └─────────────────────────────────────────────────┘

Wire into the main CLI.
"
```

---

## Phase 5: Ghost Token Audit & CLAUDE.md Optimizer (Session 6)

### Step 12: Build the audit engine

```
claude "Build the ghost token audit system in src/audit/.

1. ghostTokens.ts:
   - Scan ~/.claude/settings.json for MCP server configs
   - Count tools per MCP server (parse .mcp.json and ~/.claude.json)
   - Calculate: system_prompt(14328) + built_in_tools(15000) + mcp_tools(count * 600) + claudemd_tokens + autocompact_buffer(33000)
   - Return breakdown with percentage of 200K window
   - Grade: A (>70% usable), B (50-70%), C (30-50%), D (<30%)

2. claudeMdLinter.ts:
   - Parse CLAUDE.md into sections
   - Count tokens per section
   - Detect critical rules (regex: /NEVER|ALWAYS|MUST|IMPORTANT|CRITICAL/i)
   - Score position against U-shaped attention curve:
     - Position 0-30%: HIGH attention (good for critical rules)
     - Position 30-70%: LOW attention (bad for critical rules)
     - Position 70-100%: HIGH attention (good for critical rules)
   - Flag critical rules in the 30-70% 'dead zone'
   - Check total line count (warn if >200 lines)
   - Detect content that should be in skills instead
   - Generate optimized reordering suggestion

3. mcpAnalyzer.ts:
   - List all configured MCP servers with estimated token cost
   - Flag servers with >10 tools as 'heavy'
   - Check if Tool Search is enabled (reduces overhead by ~85%)
   - Suggest CLI alternatives for common MCP servers

4. recommendations.ts:
   - Aggregate findings from all audit modules
   - Generate prioritized, actionable recommendations
   - Each recommendation has: priority (high/medium/low), impact (tokens saved), action (what to do)
"
```

### Step 13: Build the audit command

```
claude "Build the audit command in src/cli/commands/audit.ts.

Requirements:
1. 'kerf audit' — Run full audit of current Claude Code setup

2. Options:
   --fix              Auto-apply safe fixes (reorder CLAUDE.md, disable unused MCP)
   --claude-md-only   Only audit CLAUDE.md
   --mcp-only         Only audit MCP servers
   --json             Output as JSON

3. Display:

   ┌─────────────────────────────────────────────────┐
   │ ⚒️  kerf audit report                           │
   ├─────────────────────────────────────────────────┤
   │ Context Window Health: B (62% usable)            │
   │                                                  │
   │ Ghost Token Breakdown:                           │
   │   System prompt:     14,328 tokens (7.2%)        │
   │   Built-in tools:    15,000 tokens (7.5%)        │
   │   MCP tools (3 srv): 8,400 tokens  (4.2%)       │
   │   CLAUDE.md:         2,100 tokens  (1.1%)        │
   │   Autocompact buffer:33,000 tokens (16.5%)       │
   │   ─────────────────────────────────              │
   │   Total overhead:    72,828 tokens (36.4%)       │
   │   Effective window:  127,172 tokens (63.6%)      │
   │                                                  │
   │ CLAUDE.md Analysis:                              │
   │   Lines: 245 (⚠️  over 200 limit)               │
   │   Critical rules in dead zone: 3                 │
   │   Sections to move to skills: 2                  │
   │                                                  │
   │ 📋 Recommendations:                              │
   │   1. [HIGH] Move 'PR Review' section to skill    │
   │      Impact: -450 tokens/session                 │
   │   2. [HIGH] Reorder CLAUDE.md critical rules     │
   │      Impact: improved rule adherence             │
   │   3. [MED] Disable unused 'playwright' MCP       │
   │      Impact: -3,442 tokens/session               │
   └─────────────────────────────────────────────────┘

Wire into the main CLI.
"
```

---

## Phase 6: Hook System & Init (Session 7)

### Step 14: Build the hook installer

```
claude "Build the hook system in src/hooks/.

1. Create hook templates in src/hooks/templates/:

   a. notification.sh — Logs token usage to ~/.kerf/session-log.jsonl on each Claude notification
      - Receives JSON on stdin with session_id and transcript_path
      - Appends timestamp + basic metrics to the kerf log

   b. stop.sh — Budget enforcement hook
      - On each Claude stop event, check budget via 'kerf budget check --json'
      - If over 80%: inject warning via 'reason' field
      - If over 100%: block (exit with reason) — but make this configurable

2. Build installer.ts:
   - kerf init: Installs hooks to project .claude/settings.json
   - kerf init --global: Installs to ~/.claude/settings.json
   - Detects existing hooks and merges (doesn't overwrite)
   - Creates ~/.kerf/ directory for data storage
   - Backs up existing settings before modification
   - Shows what will be installed and asks for confirmation

3. Hook configuration in settings.json format:
   {
     'hooks': {
       'Notification': [{
         'matcher': '',
         'hooks': [{
           'type': 'command',
           'command': 'path/to/kerf/hooks/notification.sh'
         }]
       }],
       'Stop': [{
         'matcher': '',
         'hooks': [{
           'type': 'command',
           'command': 'path/to/kerf/hooks/stop.sh'
         }]
       }]
     }
   }
"
```

### Step 15: Build the init command

```
claude "Build the init command in src/cli/commands/init.ts.

Requirements:
1. 'kerf init' — Set up kerf for the current project
   - Create ~/.kerf/ directory
   - Initialize SQLite database
   - Install hooks (with confirmation prompt)
   - Detect existing tools (RTK, ccusage) and show compatibility info
   - Generate recommended settings

2. Options:
   --global           Install hooks globally
   --hooks-only       Only install hooks (skip database setup)
   --no-hooks         Skip hook installation
   --force            Skip confirmation prompts

3. Interactive flow:
   Welcome to kerf! ⚒️
   
   Setting up cost intelligence for Claude Code...
   
   ✅ Created ~/.kerf/kerf.db
   ✅ Detected RTK (command compression) — compatible!
   ✅ Detected ccusage — will import historical data
   
   Install hooks? These enable:
   • Real-time token tracking (Notification hook)
   • Budget enforcement (Stop hook)
   
   Hooks will be added to .claude/settings.json
   [Y/n]: 
   
   ✅ Hooks installed
   
   Recommended settings for your setup:
   {
     'model': 'sonnet',
     'env': {
       'MAX_THINKING_TOKENS': '10000',
       'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE': '50'
     }
   }
   
   Run 'kerf watch' to start the live dashboard!

Wire into the main CLI.
"
```

---

## Phase 7: Historical Reports (Session 8)

### Step 16: Build the report command

```
claude "Build the report command in src/cli/commands/report.ts.

Requirements:
1. 'kerf report' — Show historical cost reports

2. Subcommands/options:
   --period today|week|month|all (default: today)
   --project <path>     Filter to specific project
   --model              Show per-model breakdown
   --sessions           Show per-session breakdown
   --csv                Export as CSV
   --json               Export as JSON

3. Default display (kerf report):

   ┌─────────────────────────────────────────────────┐
   │ ⚒️  kerf report — Today (Apr 4, 2026)           │
   ├─────────────────────────────────────────────────┤
   │ Total Cost: $8.42                                │
   │ Total Tokens: 1,247,000 in / 8,200 out           │
   │ Cache Hit Rate: 94.2%                            │
   │ Sessions: 4                                      │
   │ Active Time: 3h 12m                              │
   │                                                  │
   │ Model Breakdown:                                 │
   │   Sonnet: $6.20 (73.6%) — 3 sessions             │
   │   Opus:   $2.22 (26.4%) — 1 session              │
   │                                                  │
   │ Hourly:                                          │
   │   9AM ████████░░ $2.10                            │
   │  10AM ████████████░░ $3.40                        │
   │  11AM ████░░░░░░ $1.20                            │
   │  12PM ██████░░░░ $1.72                            │
   │                                                  │
   │ 💡 Tip: Your Opus session cost 3.5x more/token.  │
   │    Consider Sonnet for implementation work.       │
   └─────────────────────────────────────────────────┘

Wire into the main CLI.
"
```

---

## Phase 8: Build, Test & Polish (Session 9)

### Step 17: Write comprehensive tests

```
claude "Write comprehensive vitest tests for all core modules:

1. tests/parser.test.ts — Test JSONL parsing with fixtures
2. tests/costCalculator.test.ts — Test cost calculations against known values
3. tests/estimator.test.ts — Test estimation with different task types
4. tests/budgetManager.test.ts — Test budget CRUD and period calculations
5. tests/tokenCounter.test.ts — Test heuristic vs known token counts
6. tests/claudeMdLinter.test.ts — Test attention curve scoring
7. tests/ghostTokens.test.ts — Test overhead calculations

Create realistic fixture data in tests/fixtures/:
- sample-session.jsonl (20+ messages with realistic token counts)
- sample-claude-md.md (a bloated 300-line CLAUDE.md for testing)
- sample-settings.json (with MCP servers configured)

Each test file should have at least 5 test cases covering happy path, edge cases, and error handling.
"
```

### Step 18: Build and verify

```
claude "Set up the build pipeline:

1. Configure tsup.config.ts:
   - Entry: src/cli/index.ts
   - Format: esm
   - Target: node20
   - Clean output
   - Add shebang plugin to prepend #!/usr/bin/env node

2. Add the prepublishOnly script that runs: build && test

3. Build the project and fix any TypeScript errors

4. Test the CLI locally:
   - npx tsx src/cli/index.ts --help
   - npx tsx src/cli/index.ts audit
   - npx tsx src/cli/index.ts estimate 'fix a typo'

5. Make sure all vitest tests pass

6. Create a .npmignore that excludes: src/, tests/, tsconfig.json, .github/
"
```

---

## Phase 9: README & Launch Prep (Session 10)

### Step 19: Create the killer README

```
claude "Create a README.md that will make this project go viral on GitHub.

Structure:
1. Hero section:
   - Name: kerf (⚒️ emoji)
   - Tagline: 'Cost intelligence for Claude Code. Know before you spend.'
   - Subline: 'kerf (n.) — the width of material removed by a cutting tool. Every token operation has a kerf.'
   - Badges: npm version, license (MIT), Node 20+, TypeScript
   - ASCII art demo showing the dashboard (use box-drawing characters)

2. The 'Magic Moment' section (30-second hook):
   Show a before/after:
   Before: '❌ 20x Max plan exhausted in 19 minutes'
   After: '✅ kerf watch — always know your burn rate'

3. Quick Start (3 commands max):
   npx kerf@latest init
   npx kerf@latest watch
   npx kerf@latest audit

4. Features section with ASCII screenshots:
   - Real-time dashboard (kerf watch)
   - Pre-flight estimation (kerf estimate)
   - Per-project budgets (kerf budget)
   - Ghost token audit (kerf audit)
   - CLAUDE.md optimization
   - Historical reports (kerf report)

5. Why kerf? section:
   - Comparison table: kerf vs RTK vs ccusage vs token-optimizer
   - Positioning: 'RTK compresses. ccusage tracks. kerf predicts.'

6. Works With section:
   - RTK ✅ (complementary — kerf shows savings from RTK)
   - ccusage ✅ (imports historical data)
   - ECC ✅ (compatible hooks)

7. Configuration section

8. Contributing section

9. License (MIT)

Make it punchy, scannable, and developer-friendly. No fluff.
"
```

### Step 20: Set up CI/CD and publish

```
claude "Set up GitHub Actions CI and npm publishing:

1. .github/workflows/ci.yml:
   - Trigger on push to main and PRs
   - Matrix: Node 20, 22
   - Steps: install, lint, test, build
   - Cache node_modules

2. .github/workflows/publish.yml:
   - Trigger on GitHub release creation
   - Build, test, publish to npm
   - Uses NPM_TOKEN secret

3. Create .github/ISSUE_TEMPLATE/ with bug report and feature request templates

4. Create .github/PULL_REQUEST_TEMPLATE.md

5. Final checklist before publishing:
   - [ ] All tests pass
   - [ ] Build succeeds
   - [ ] npx kerf@latest --help works
   - [ ] README has demo GIF placeholder
   - [ ] CHANGELOG.md exists with v0.1.0
   - [ ] package.json has correct metadata (description, keywords, repository, author: 'Dhanush Kumar Sivaji')
   - [ ] Keywords: claude-code, token-optimization, cost-intelligence, developer-tools, cli, kerf
"
```

---

## Post-Launch Commands (Future Sessions)

### V1.1 — Demo GIF Generation

```
claude "Create a script that uses asciinema to record a demo GIF of kerf in action:
1. Record kerf watch with simulated data
2. Record kerf audit on a real project
3. Record kerf estimate 'refactor auth module'
4. Convert to GIF using agg (asciinema gif generator)
5. Optimize GIF size (<2MB for GitHub README)
"
```

### V1.2 — ccusage Data Import

```
claude "Add a 'kerf import' command that imports historical data from ccusage:
- Parse ccusage output format
- Import into kerf's SQLite database
- Deduplicate existing entries
- Show import summary
"
```

### V1.3 — Web Dashboard (React)

```
claude "Add an optional web dashboard that opens in the browser:
- 'kerf dashboard --web' opens a local React app on port 3847
- Uses the same data layer as the CLI
- Charts: daily cost trend, model usage pie chart, session timeline
- Built with React + Recharts (leveraging Dhanush's React expertise)
- Served via a lightweight HTTP server (no framework needed)
"
```

---

## Quick Reference: All kerf Commands

| Command | Description |
|---------|-------------|
| `kerf` / `kerf watch` | Real-time cost dashboard (default) |
| `kerf estimate <task>` | Pre-flight cost estimation |
| `kerf budget set <amt>` | Set project budget |
| `kerf budget show` | Show current budget status |
| `kerf budget list` | List all project budgets |
| `kerf audit` | Ghost token & CLAUDE.md audit |
| `kerf audit --fix` | Auto-apply safe optimizations |
| `kerf report` | Historical cost reports |
| `kerf report --period week` | Weekly cost report |
| `kerf report --csv` | Export costs as CSV |
| `kerf init` | Set up kerf (hooks, database) |
| `kerf init --global` | Install hooks globally |

---

## Development Tips

1. **Start each Claude Code session** with: `Read CLAUDE.md, then continue from where we left off`
2. **End each session** with: `Update CLAUDE.md with current progress and next steps`
3. **Use /compact** between phases to save context
4. **Test incrementally** — run `npx vitest` after each module
5. **Use Sonnet** for implementation, **Opus for planning** — practice what kerf preaches!
6. **Pin the session** — each phase is designed to fit in one Claude Code context window

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      kerf CLI                           │
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

---

## GitHub Repository Setup

```bash
# After Phase 10 is complete:
git init
git add .
git commit -m "feat: kerf v0.1.0 — cost intelligence for Claude Code"
git remote add origin git@github.com:dhanushkumarsivaji/kerf.git
git push -u origin main

# Claim the npm package name immediately:
npm publish --access public

# Verify:
npx kerf@latest --help
```
