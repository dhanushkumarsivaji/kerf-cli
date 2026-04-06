# Twitter/X Thread

Post each tweet separately. Numbering is for reference only -- do not include "1/8" etc. in the actual tweets.

---

## Tweet 1 (Hook)

I built an open-source cost intelligence tool for Claude Code.

Real-time dashboards. Pre-flight estimates. Ghost token audits. Per-project budgets.

It's called kerf-cli and it's free.

Here's what it does and why I built it:

---

## Tweet 2 (Problem)

The problem: Claude Code has zero cost visibility.

I exhausted my 20x Max plan in 19 minutes. No warnings. No dashboard. No idea where the tokens went.

Turns out 36% of the 200K context window is consumed by invisible "ghost tokens" before you even type a word.

---

## Tweet 3 (Ghost tokens)

Ghost tokens -- the overhead you never see:

- System prompt: 14,328 tokens (7.2%)
- Built-in tools: 15,000 tokens (7.5%)
- MCP tools: ~600 tokens PER tool
- CLAUDE.md: variable
- Autocompact buffer: 33,000 tokens (16.5%)

You think you have 200K tokens. You actually have ~127K.

`kerf audit` shows you exactly where they go.

---

## Tweet 4 (Watch)

`kerf watch` -- real-time cost dashboard in a second terminal.

Shows: $/min burn rate, context fill %, projected session cost, per-message cost breakdown.

Refreshes every 2 seconds. Auto-detects the active Claude Code session.

[screenshot: kerf watch dashboard]

---

## Tweet 5 (Estimate)

`kerf estimate` -- know the cost before you start.

```
$ kerf estimate --compare 'refactor auth'

  sonnet   $1.60 - $4.43
  opus     $8.02 - $22.17
  haiku    $0.43 - $1.18
```

This one feature changed how I pick models. Sonnet for implementation, Opus only for planning.

---

## Tweet 6 (Audit + attention curve)

The feature nobody expects: CLAUDE.md attention curve analysis.

Claude's attention is U-shaped. Top 30% and bottom 30% get high attention. The middle is a dead zone.

`kerf audit --claude-md-only` flags your critical rules (NEVER, ALWAYS, MUST) stuck in the dead zone.

Free fix. Zero cost. Move them to the top or bottom.

---

## Tweet 7 (Tech)

Tech stack:

- TypeScript, 3500+ lines
- Ink (React for terminals) for live dashboards
- SQLite for budgets and tracking
- 73 tests
- MIT license

7 commands: watch, estimate, audit, budget, report, import, dashboard.

Parses Claude Code's JSONL session logs. No API keys needed.

---

## Tweet 8 (CTA)

Try it now:

```
npx kerf-cli@latest init
npx kerf-cli@latest watch
npx kerf-cli@latest audit
```

GitHub: github.com/dhanushkumarsivaji/kerf-cli

Star it if it's useful. Open an issue if it's not.

Built by @dhanushkumarsivaji
