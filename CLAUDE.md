# kerf-cli — Claude Code Cost Intelligence

## Project Overview
TypeScript CLI tool providing real-time cost intelligence for Claude Code.
Name origin: kerf = width of material removed by a cutting tool (token waste).
Published as `kerf-cli` on npm. Distributed via `npx kerf-cli@latest`. Uses Ink (React for CLI) for terminal UI.

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
