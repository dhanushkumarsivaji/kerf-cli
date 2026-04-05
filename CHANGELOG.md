# Changelog

## v0.1.1 (2026-04-04)

- Fix: ContextBar crash when token usage exceeds 100% of context window
- Fix: Package published as `kerf-cli` (npm blocked unscoped `kerf`)

## v0.1.0 (2026-04-04)

Initial release.

- `npx kerf-cli watch` — Real-time cost dashboard
- `npx kerf-cli estimate <task>` — Pre-flight cost estimation
- `npx kerf-cli budget set/show/list/remove` — Per-project budget management
- `npx kerf-cli audit` — Ghost token & CLAUDE.md audit
- `npx kerf-cli report` — Historical cost reports
- `npx kerf-cli init` — Setup hooks and database
