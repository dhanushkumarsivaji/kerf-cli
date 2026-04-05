# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
