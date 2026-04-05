# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
