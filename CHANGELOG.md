# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.0] - 2026-06-02

### Added — CI/CD cost gates + ROI (Phase E2)
- **Branch cost attribution:** the ingest now records each message's git branch
  (`git_branch` column) — extracted from Claude Code's `gitBranch` and Codex's
  `session_meta.git.branch`. "HEAD"/detached is treated as no branch. (Populated
  for sessions recorded going forward.)
- **`kerf ci report`** — AI cost attributable to the current branch as Markdown
  (PR-comment / `$GITHUB_STEP_SUMMARY` ready) or JSON. Branch auto-detected from
  CI env (`GITHUB_HEAD_REF`/`GITHUB_REF_NAME`/…) then local git.
- **`kerf ci gate --max <usd>`** — exits `1` when the branch's cost exceeds the
  threshold (`0` within, `2` bad args), to fail a CI check.
- **GitHub composite action** at `.github/actions/kerf-cost` for PR cost summaries
  and gating.
- **`kerf roi`** (exploratory) — spend vs delivery (commits/merges) for the repo.

### Notes
- kerf stays local-first: `kerf ci` reads the local `~/.kerf/kerf.db`, so it's
  meaningful where the usage data lives (your machine / a runner that has it).
  A stock cloud runner with no local data reports $0.00.

## [3.2.0] - 2026-06-02

### Added — kerf MCP server (Phase E1)
- **`kerf mcp`** starts a Model Context Protocol server over stdio so you can ask
  your assistant about your spend from inside Claude Code, Cursor, or any MCP
  client — "how much did I spend on this project this week?" — without leaving the
  editor. Register with `claude mcp add kerf -- kerf mcp`.
- Tools exposed (all read-only): `kerf_summary`, `kerf_query`, `kerf_efficiency`,
  `kerf_forecast`, `kerf_budget_status`.
- **Safety:** `kerf_query` reuses the *exact same* read-only SQL guard as the
  `kerf query` CLI (extracted to `src/core/sqlGuard.ts` so there's one definition).
  Writes (`INSERT/UPDATE/DELETE/DROP/ALTER/…`) are rejected; the server binds to
  stdio only and never opens a network port or modifies the database.

## [3.1.1] - 2026-06-02

### Fixed
- **Install failures on Node 24/25/26 (esp. Windows):** bumped `better-sqlite3`
  `11.9.1 → 12.10.0`, which ships prebuilt binaries for current Node versions
  (its engines now list `20.x || 22.x || 23.x || 24.x || 25.x || 26.x`). Previously,
  newer Node had no prebuilt binary, so npm fell back to compiling from source and
  failed on machines without a C/C++ toolchain (e.g. Visual Studio Build Tools).
  No API or behavior change — purely a dependency upgrade.

### Note
- If a prebuilt binary still isn't available for your exact platform/Node combo,
  use a Node LTS release (20 or 22), which always has one.

## [3.1.0] - 2026-05-31

### Added — Cross-tool views, OpenTelemetry & external import
- **Cross-tool spend view:** `kerf summary --by-tool` breaks total spend down by
  agent (Claude Code vs Codex vs …) with shares and session counts.
- **`--tool <id>` filter** on `summary`, `sessions`, `efficiency`, and `cache`;
  `sessions` gains a **Tool** column; `query` exposes the `tool` column + a by-tool example.
- **OpenTelemetry ingestion (log-file mode):** register GenAI telemetry logs in
  `~/.kerf/otel-sources.json`; kerf maps `gen_ai.usage.*` / `gen_ai.request.model`
  to its schema. Tool-agnostic (works for Gemini/Antigravity, OpenCode, Qwen, …);
  tolerates OTLP/JSON batches and newline-delimited records.
- **External import for tools without logs (Cursor, Copilot, …):**
  `kerf import --external [path]` ingests `~/.kerf/external-additions.json`
  (also auto-picked-up by `kerf sync`). Documented schema for community exporters.
- Gemini pricing added (`gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3.5-flash`).
- `kerf doctor` now reports every detected tool.

### Fixed
- **CI was broken:** `package-lock.json` was stuck at `0.1.0` while `package.json`
  had advanced, so `npm ci` failed in GitHub Actions. The lockfile is now in sync.
- Removed the npm publish workflow (`.github/workflows/publish.yml`) — releases are
  no longer auto-published to npm.

## [3.0.0] - 2026-05-31

### Added — Multi-tool support: Codex CLI 🎉
- **kerf now tracks Codex CLI usage alongside Claude Code.** It auto-discovers
  Codex rollout files at `~/.codex/sessions/**/rollout-*.jsonl` (honoring
  `CODEX_HOME`, including comma-separated roots) and ingests them into the same
  analytics database, tagged `tool='codex'`.
- `CodexAdapter` parses Codex's real rollout schema (verified against
  `cli_version` 0.117.x): per-call usage from `token_count` events'
  `last_token_usage`, model from `turn_context`, project path from
  `session_meta` cwd. Codex's prompt-inclusive `input_tokens` is split into
  uncached input + `cache_read`, and verbatim-duplicate `token_count` events are
  de-duplicated so per-message totals match Codex's own reported session total.
- OpenAI/Codex pricing added (`gpt-5`, `gpt-5-codex`, `gpt-5-mini`, `o4-mini`;
  `gpt-5.x` resolves via prefix). **Verify current rates before each release.**
- `kerf sync --tool <id>` syncs a single tool; sync output now reports per-tool counts.

### Known limitations
- Codex `service_tier` (priority/fast) pricing multipliers are not yet applied —
  standard pricing is used. Planned for a later release.

## [2.5.0] - 2026-05-31

### Changed — Pluggable adapter architecture (foundation for multi-tool support)
- Introduced an `IngestAdapter` interface (`src/adapters/`) that wraps each tool's
  session discovery + parsing behind a common contract. The existing Claude Code
  logic now lives in `ClaudeCodeAdapter`; `IngestService` is fully adapter-driven.
- Added an adapter registry (`getAdapters`, `getAllAdapterIds`, `getAdapterById`).
- `kerf sync` now reports results per tool and accepts `--tool <id>` to sync one tool.

### Database
- Migration v4 adds a `tool` column to `messages` and `sessions_meta` (default
  `'claude-code'`, so existing rows backfill automatically — **no re-sync required**),
  a `tool_breakdown` column to `daily_summaries`, and supporting indexes.

### Notes
- No user-facing behavior change for existing Claude Code users. This is the
  foundation that lets later versions ingest other AI coding agents.

## [2.3.0] - 2026-05-31

### Added — Intelligence & Alerts (Phase D)
- **Real-time anomaly alerts** — `kerf monitor` is a headless background watcher
  that tails active sessions and fires the instant a cost anomaly appears
  (e.g. a runaway agent loop). Channels: terminal bell, desktop notification
  (osascript/notify-send/PowerShell), and an optional webhook (Slack/Discord/generic).
  Severity filtering and debounce included. Also `kerf watch --alerts` for the
  interactive dashboard.
- **Alert config persistence** — `~/.kerf/config.json` `alerts` section sets default
  channels, minimum severity, webhook URL, and debounce.
- **Cost forecasting** — `kerf forecast [--period week|month]` projects total spend
  from your run-rate and compares it against your typical spend over prior periods,
  with a confidence rating. A one-line projection is appended to
  `kerf summary --period week|month`.
- **Cross-tool / cross-model optimization** — `kerf efficiency --cross-tool` (default
  when more than one model has data) ranks model-downgrade, cache-optimization, and
  (on multi-tool installs) tool-consolidation recommendations by estimated monthly savings.

### Notes
- All new features stay local-first. The only outbound call is the opt-in alert
  webhook you explicitly configure, which sends only the anomaly description.

## [2.2.0] - 2026-04-07

### Added
- Real dashboard hero screenshot (`docs/assets/dashboard-hero.png`) — captured
  from the actual running dashboard with real data, not a mockup
- Honesty disclaimer on README hero image

### Fixed (cumulative across 2.1.x patches)
- **Parser dedup**: now MAX-merges duplicate message IDs per field instead of
  taking last value. Streaming JSONL emits partial usage updates per chunk; the
  old "last" merge was dropping input tokens entirely (2.1.3)
- **Cache hit rate formula**: now `cache_read / (input + cache_read + cache_creation)`
  in api.ts and cacheReporter.ts (was excluding cache_creation, returning ~100%) (2.1.3)
- **Cost chart paint order**: replaced `buildAreaPath` with `buildBandPath` so
  stacked bands render as distinct opus/sonnet/haiku layers (was: opus painted on
  top covering everything) (2.1.3)
- **Sticky hero clipping**: removed `position: sticky` + backdrop blur from hero
  that was hiding the killer features cards (2.1.3)
- **Hero "Tokens" metric**: now includes cache_creation tokens (2.1.3)
- **Period label inconsistency**: added "FOR TODAY/LAST 7 DAYS/LAST 30 DAYS/ALL TIME"
  indicator above metrics; removed period suffix from "Spent" label (2.1.3)
- **Y-axis ugly decimals**: added `niceTicks` helper rounding to clean integers
  ($0/$5/$10/$15/$20 instead of $4.1/$8.1) (2.1.3)
- **fmtDuration confusing multi-day**: capped at "1d+" for resumed sessions (2.1.3)
- **Cost chart x-axis gaps**: `fillCostTrendGaps` emits zero buckets for missing
  hours/days so the time axis is continuous (2.1.4)
- **Recharts blank dashboard**: replaced Recharts (which failed on transitive
  esm.sh deps) with inline SVG chart and donut (2.1.1)
- **Sessions table**: added pagination, sortable headers, formatted Date/Time
  columns, click-to-expand detail row (2.1.2)
- **`--version` reads from package.json**: was hardcoded (2.1.1)

## [2.1.0] - 2026-04-07

### Added — Polished Web Dashboard
- **`kerf dashboard`** is back, now SQLite-backed and Linear-grade
- Hero header with sticky position, 4 big metrics, live indicator, period picker
- Killer-features grid: Budget status, Model Efficiency savings, Cache hit rate
- Stacked area cost-over-time chart broken down by model (Opus/Sonnet/Haiku)
- Sortable session table with click-to-expand drill-down
- Welcome empty state with one-click sync
- Design system: Linear-inspired dark theme, 4px spacing grid, model color coding
- API endpoints: /api/report, /api/cost-trend, /api/sessions, /api/efficiency, /api/cache, /api/budget, /api/sync
- 5-second in-process query cache for fast polling
- Sub-100ms API response times via SQLite analytics layer
- Background ingest on dashboard startup

### Architecture
- Modular file structure: src/web/{server,routes/api,routes/static,ui/dashboardHtml}
- Single-file React SPA via importmap (no build step) — embedded as TS string

## [2.0.0] - 2026-04-07

The analytics rewrite. Kerf is now SQLite-backed: ingest your Claude Code sessions
once, query them forever.

### Added
- **SQLite analytics layer** — `messages`, `sessions_meta`, `ingest_state`, `daily_summaries` tables
- **`kerf sync`** — incremental ingest of all Claude Code session JSONLs into SQLite
- **`kerf summary`** — daily/weekly/monthly cost summaries with --by-project and --model breakdowns
- **`kerf sessions`** — list and inspect individual sessions with cost, models, duration
- **`kerf query "<sql>"`** — read-only SQL escape hatch over the analytics database
- **`kerf efficiency`** — model usage analyzer with concrete savings recommendations (Opus → Sonnet)
- **`kerf cache`** — cross-session cache hit rate analysis
- **`kerf doctor`** — diagnose Claude Code integration and kerf setup issues
- **`kerf budget check`** — exit-code-driven budget check for PreToolUse hook
- **`kerf init --enforce-budgets`** — installs PreToolUse hook that BLOCKS Claude Code over budget
- Real database migrations (schema versioning + idempotent upgrades)
- Tests for parser path encoding and migrations

### Changed
- BREAKING: `percentOfWindow` renamed to `percentOfTypicalWindow` and joined by `actualWindowSpentUsd` + `actualWindowPercentUsed`
- BREAKING: Web dashboard removed (deferred to v2.x team tier)
- BREAKING: Database schema now lives in `migrations.ts`, not `schema.ts`
- Estimator output now shows both typical-window % and actual rolling 5h spend

### Fixed
- `report --project` now correctly resolves Claude Code's encoded project paths
- Budget sync correctly uses Claude Code's path encoding (not naive substring match)
- Removed dead code: `src/integrations/rtkIntegration.ts`

### Upgrade notes
On first run after upgrade, kerf will run schema migrations automatically. Run `kerf sync`
once to populate the new analytics tables. No data migration is needed — kerf re-reads
your `~/.claude/projects/` JSONLs.

## [1.2.1] - 2026-04-05

### Fixed
- Anomaly detector false positives reduced by filtering non-substantive messages

## [1.2.0] - 2026-04-05

### Added — Cache Intelligence & Anomaly Detection
- Real-time cache health monitor — detects broken prompt cache (10-20x cost inflation) LIVE
  - Status: HEALTHY / DEGRADED / BROKEN with hit rate percentage
  - Estimated waste calculation ($ spent due to poor cache performance)
  - Alert + recommendation when cache drops below thresholds
- Per-turn cache ratio in watch dashboard (`cache:87%` next to each message)
- Anomaly detection engine — 5 anomaly types:
  - Cost spike (>3x session average)
  - Cache ratio drop (sudden invalidation)
  - Input explosion (unexpected context growth)
  - Thinking token bloat (>30K output tokens)
  - Session resume bloat (first turn >50K output)
- RTK integration — detects RTK, shows install tip in `kerf init`
- Cache health card in web dashboard API
- Anomaly alerts in web dashboard API and report output
- 19 new tests (92 total)

### Changed
- Watch dashboard shows cache health between ContextBar and Recent Messages
- Recent Messages shows per-turn cache hit ratio
- Report includes cache health summary and anomaly list
- Web dashboard API returns cacheHealth and anomalies in JSON

## [1.0.1] - 2026-04-05

### Fixed
- Remove CORS wildcard from dashboard API (prevents local data exfiltration)
- Validate JSON in notification hook before log embedding
- Sanitize error responses in dashboard server

## [1.0.0] - 2026-04-05

### Added
- Smart estimator with multi-signal complexity scoring (keywords + file size + file count + description length)
- Tool call overhead modeling in cost estimates (1-5 tool calls/turn based on complexity)
- Optional Anthropic count_tokens API integration (`--precise` flag)
- `kerf audit --fix` auto-reorders CLAUDE.md sections for optimal attention curve
- `kerf import` command for syncing all historical session data into budget database
- `kerf dashboard` — React web dashboard with charts (Recharts) on localhost:3847
  - Cost over time area chart
  - Session breakdown table
  - Ghost token visualization
  - Period selector (today/week/month)
  - Auto-refresh every 10 seconds
  - CSV export
- Complexity signals breakdown in estimate output
- `findClaudeMdPath` utility for consistent CLAUDE.md resolution
- Launch content for HN, Reddit, DEV, Twitter

### Changed
- Estimator uses continuous scoring (0-1) instead of 3 fixed tiers
- Keywords weight adjusts when no files specified (60% keywords vs 35% with files)
- Output tokens per turn scales with file size

### Fixed
- All P0/P1/P2 fixes from v0.2.x applied

## [0.2.2] - 2026-04-04

### Fixed
- Smarter task complexity detection with expanded keywords and word-count heuristic

## [0.2.1] - 2026-04-04

### Fixed
- 10 bugs from code review: init hooks, percentOfWindow, budget sync, estimator pricing, dead code, session grouping, streaming parser, linter git root, DRY MCP
- Added 32 new tests (66 total)

## [0.2.0] - 2026-04-04

### Added
- `kerf` binary alias — both `kerf` and `kerf-cli` now work as command names
- Repository metadata (homepage, bugs, repository fields in package.json)
- CI badge in README
- `test:coverage` script
- Separate CHANGELOG.md following Keep a Changelog format
- ARCHITECTURE.md with project structure, design decisions, and data flow
- LAUNCH-POST.md for social media launch content

### Changed
- README rewritten with `kerf` as primary command name for brevity
- All command examples use short `kerf` form

## [0.1.5] - 2026-04-04

### Fixed
- Version injection via tsup `define` instead of runtime `createRequire` — fixes `Cannot find module '../../package.json'` when running from npm

## [0.1.4] - 2026-04-04

### Fixed
- `--version` now reads dynamically from package.json
- `--compare` shows proper side-by-side table for all 3 models (was only rendering first)
- `watch` gracefully exits in non-TTY environments with helpful message
- `useInput` disabled in non-TTY to prevent raw mode crash

## [0.1.3] - 2026-04-04

### Fixed
- CLAUDE.md detection now searches git root and `~/.claude/` (not just cwd)
- `--claude-md-only` shows per-section breakdown with attention zones and suggested reorder
- `--mcp-only` properly filters to MCP-only output and recommendations
- Hourly report dates no longer show "Invalid Date"

## [0.1.1] - 2026-04-04

### Fixed
- ContextBar crash when token usage exceeds 100% of context window (negative `String.repeat`)

## [0.1.0] - 2026-04-04

### Added
- `kerf-cli watch` — Real-time cost dashboard with Ink (React for CLI)
- `kerf-cli estimate <task>` — Pre-flight cost estimation with complexity detection
- `kerf-cli budget set/show/list/remove` — Per-project budget management with SQLite
- `kerf-cli audit` — Ghost token audit with CLAUDE.md attention curve analysis
- `kerf-cli report` — Historical cost reports with hourly charts, CSV/JSON export
- `kerf-cli init` — Setup hooks, database, and detect compatible tools
- JSONL session log parser with message deduplication
- Per-model pricing engine (Sonnet 4, Opus 4, Haiku 4)
- Token counting heuristic (characters / 3.5)
- Context overhead calculator (ghost tokens)
- MCP server token cost analyzer
- Claude Code hook templates (notification + budget enforcement)
- 34 vitest tests with fixture data
- CI/CD with GitHub Actions (test on Node 20/22, publish on release)

[0.2.0]: https://github.com/dhanushkumarsivaji/kerf-cli/compare/v0.1.5...v0.2.0
[0.1.5]: https://github.com/dhanushkumarsivaji/kerf-cli/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/dhanushkumarsivaji/kerf-cli/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/dhanushkumarsivaji/kerf-cli/compare/v0.1.1...v0.1.3
[0.1.1]: https://github.com/dhanushkumarsivaji/kerf-cli/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/dhanushkumarsivaji/kerf-cli/releases/tag/v0.1.0
