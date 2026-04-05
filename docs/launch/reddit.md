# Reddit Post

**Subreddits:** r/ClaudeAI, r/ChatGPTCoding

**Title:** I built an open-source cost intelligence tool for Claude Code -- estimates cost before you start, tracks spending in real-time, and audits ghost tokens

---

## Post Body (copy-paste below)

I kept burning through my Claude Code Max plan in under 20 minutes. No warnings, no dashboard, no idea where the tokens went. So I built **kerf-cli** -- an open-source CLI that gives you full cost visibility.

### The problem (with numbers)

Your Claude Code context window is 200K tokens. But before you type a single word, here's what's already consumed:

| Ghost Token Source | Tokens | % of Context |
|---|---|---|
| System prompt | 14,328 | 7.2% |
| Built-in tools (24 tools) | 15,000 | 7.5% |
| MCP tools (3 servers, ~14 tools) | 8,400 | 4.2% |
| CLAUDE.md | 2,100 | 1.1% |
| Autocompact buffer | 33,000 | 16.5% |
| **Total overhead** | **72,828** | **36.4%** |

**36% of your 200K context is invisible overhead.** You're working with ~127K tokens, not 200K. And if you have more MCP servers, it gets worse -- each tool costs ~600 tokens.

### What kerf-cli does

**Real-time cost dashboard** -- run `kerf watch` in a second terminal:

```
┌──────────────────────────────────────────────────────────────┐
│  kerf watch | session: a3f8c2d1... | 47 messages             │
├──────────────────────────────────────────────────────────────┤
│  >> $4.82 / ~$15.00 window | $0.18/min | ~56m remaining     │
│  [████████████░░░░░░░░░░░░░░░░░░] 38% | 76K / 200K tokens   │
│    system(14K) + tools(15K) + mcp(8K) + conversation(39K)   │
└──────────────────────────────────────────────────────────────┘
```

**Pre-flight cost estimation** -- know what a task will cost before you start:

```
$ kerf estimate --compare 'refactor auth module'

  Model      Turns          Low          Expected     High
  ----------------------------------------------------------
  sonnet     15-40          $1.60        $2.62        $4.43
  opus       15-40          $8.02        $13.11       $22.17
  haiku      15-40          $0.43        $0.70        $1.18

  Cheapest: haiku at $0.70
  Priciest: opus at $13.11
```

**Ghost token audit** -- find the invisible waste:

```
$ kerf audit

  Context Window Health: B (62% usable)

  Ghost Token Breakdown:
    System prompt:     14,328 tokens (7.2%)
    Built-in tools:    15,000 tokens (7.5%)
    MCP tools (3 srv):  8,400 tokens (4.2%)
    CLAUDE.md:          2,100 tokens (1.1%)
    Autocompact buffer:33,000 tokens (16.5%)

  Recommendations:
    1. [HIGH] Reorder CLAUDE.md -- 3 critical rules in dead zone
    2. [MED] Disable unused 'playwright' MCP server (-7,200 tokens)
```

**Per-project budgets** with automatic warnings:

```
$ kerf budget show

  Period:  weekly (2026-03-31 to 2026-04-06)
  Budget:  $50.00
  Spent:   $42.30
  [████████████████░░░░] 84.6%
```

**Historical reports** with CSV/JSON export:

```
$ kerf report

  Total Cost:       $12.77
  Total Tokens:     906 in / 84.1K out
  Cache Hit Rate:   100.0%
  Sessions:         3

  Hourly:
    Apr 4, 2 AM    █████░░░░░░░ $2.27
    Apr 4, 6 PM    ████████████ $5.64
```

### One thing most people don't know

Claude's attention follows a **U-shaped curve** across your CLAUDE.md. The top ~30% and bottom ~30% get high attention. The middle 30-70% is a "dead zone." If your critical rules (NEVER, ALWAYS, MUST) are stuck in the middle, Claude is more likely to ignore them. `kerf audit --claude-md-only` flags exactly this.

### Install

```bash
npx kerf-cli@latest init      # set up database & hooks
npx kerf-cli@latest watch     # live dashboard
npx kerf-cli@latest audit     # find ghost tokens
```

Or install globally: `npm i -g kerf-cli` then just use `kerf`.

### Details

- TypeScript, MIT license, 73 tests
- GitHub: https://github.com/dhanushkumarsivaji/kerf-cli
- npm: https://www.npmjs.com/package/kerf-cli

Works alongside RTK, ccusage, and ECC -- it's complementary, not a replacement.

Happy to answer questions. What features would you want to see next?
