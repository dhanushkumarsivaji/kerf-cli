# Show HN: kerf-cli -- Cost intelligence for Claude Code (real-time dashboards, estimation, budgets)

**Link:** https://github.com/dhanushkumarsivaji/kerf-cli

---

## First Comment (copy-paste this as your first reply)

Hey HN -- Dhanush here. I build developer tools and I made kerf-cli because I kept exhausting my Claude Code Max plan in under 20 minutes with zero idea why.

**The problem:** Claude Code has no built-in cost visibility. Your 200K context window gets silently eaten by ghost tokens -- system prompt (14K), built-in tools (15K), MCP servers (~600 tokens per tool), CLAUDE.md, and autocompact buffer (33K). That's 36% of your context consumed before your conversation starts. And there's no way to see token burn rate, predict what a task will cost, or set spending limits.

**What kerf-cli does (7 commands):**

- `kerf watch` -- real-time cost dashboard in a second terminal. Shows $/min burn rate, context fill %, and projected cost.
- `kerf estimate 'refactor auth'` -- pre-flight cost estimation. Tells you low/expected/high cost before you start. Compares Sonnet vs Opus vs Haiku side by side.
- `kerf audit` -- finds ghost tokens eating your context. Grades your context window health (A-D). Analyzes your CLAUDE.md against Claude's U-shaped attention curve and flags critical rules stuck in the dead zone.
- `kerf budget set 50 --period weekly` -- per-project spending limits with automatic warnings at 80% and alerts at 100%.
- `kerf report` -- daily/weekly/monthly spending reports with hourly charts, per-model breakdowns, CSV/JSON export.
- `kerf import` -- import historical session data.
- `kerf dashboard` -- web-based dashboard view.

**Technical decisions:**

- TypeScript + Ink (React for terminals) + SQLite (better-sqlite3, synchronous for fast CLI startup)
- Parses Claude Code's JSONL session logs from `~/.claude/projects/`
- Token counting uses a `characters / 3.5` heuristic for instant local estimation. When `total_cost_usd` is present in the JSONL logs, that authoritative value is used instead.
- Hooks system: shell scripts that auto-log token usage and enforce budgets during Claude Code sessions
- 3500+ lines of TypeScript, 73 tests, bundled with tsup as ESM

**What makes it different from existing tools:**

- **RTK** compresses context to extend sessions -- it reduces cost but doesn't show you what you're spending.
- **ccusage** tracks historical usage after the fact -- great for reports, but no real-time monitoring or prediction.
- **kerf** predicts cost before you start, monitors in real-time while you work, and audits invisible overhead. It's complementary to both.

**Honest limitations:**

- Token counting is heuristic, not exact. The `characters / 3.5` ratio is a reasonable approximation but not a tokenizer. When the JSONL logs include `total_cost_usd`, kerf uses that instead.
- Task estimation uses keyword-based complexity detection (e.g., "refactor" = complex, "fix" = medium). It works surprisingly well for ballpark estimates but won't be accurate for unusual tasks.
- Ghost token constants (system prompt size, tool overhead) are based on observed values and may shift as Anthropic updates Claude Code.

**What's next:**

- Smarter estimation using historical session data (your actual turn counts and costs, not just keywords)
- Team dashboards for shared cost visibility
- Tighter integration with Claude Code's hook system as it evolves

Install: `npx kerf-cli@latest init`

Happy to answer questions about the architecture, token counting approach, or anything else.
