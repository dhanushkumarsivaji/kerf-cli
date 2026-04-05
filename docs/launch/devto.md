---
title: "How I Built kerf-cli: Cost Intelligence for Claude Code"
published: true
tags: typescript, cli, ai, opensource
cover_image: 
---

# How I Built kerf-cli: Cost Intelligence for Claude Code

I was burning through my Claude Code Max plan in under 20 minutes. No warnings, no dashboard, no idea where the tokens went. So I built [kerf-cli](https://github.com/dhanushkumarsivaji/kerf-cli) -- an open-source CLI that gives you real-time cost dashboards, pre-flight estimation, budgets, and ghost token auditing for Claude Code.

> *kerf (n.) -- the width of material removed by a cutting tool. Every token operation has a kerf.*

## The Problem

Claude Code is incredible for development, but it has a blind spot: **cost visibility**. There is no built-in way to see how fast you are burning tokens, what a task will cost before you start, or what invisible overhead is eating your context window.

I started noticing patterns:
- Simple "fix this typo" tasks sometimes cost more than complex refactors
- My 200K context window seemed to fill up faster than it should
- Switching between Sonnet and Opus had dramatic cost differences I could not predict

I needed a tool that answered three questions:
1. **How much am I spending right now?**
2. **How much will this task cost?**
3. **Where are my tokens going?**

## Ghost Tokens Explained

This is the part that surprised me most. Before you type a single word in Claude Code, a significant chunk of your 200K context window is already consumed:

```
Ghost Token Breakdown:
  System prompt:      14,328 tokens  (7.2%)
  Built-in tools:     15,000 tokens  (7.5%)
  MCP tools (3 srv):   8,400 tokens  (4.2%)
  CLAUDE.md:            2,100 tokens  (1.1%)
  Autocompact buffer: 33,000 tokens  (16.5%)
  ─────────────────────────────────────────
  Total overhead:     72,828 tokens  (36.4%)
```

**36% of your context is gone before the conversation starts.** You are not working with 200K tokens. You are working with ~127K.

And it gets worse. Each MCP tool costs approximately 600 tokens. If you have three MCP servers with 14 tools total, that is 8,400 tokens of overhead. I have seen setups with 6+ MCP servers where ghost tokens consume over 50% of the context window.

I call this "ghost tokens" because they are invisible -- Claude Code does not show them anywhere in the UI. But they are real, they consume context, and they cost money.

## Building the Estimator

The pre-flight cost estimator was the feature I wanted most. Before starting a task, I wanted to know: "Is this a $0.50 task or a $15 task?"

The approach is keyword-based complexity detection:

```typescript
// Simplified version of the estimation logic
const COMPLEXITY_MAP = {
  simple: {
    keywords: ['typo', 'rename', 'delete', 'remove', 'log'],
    turns: { low: 2, expected: 3, high: 5 }
  },
  medium: {
    keywords: ['fix', 'add', 'update', 'change', 'test'],
    turns: { low: 5, expected: 8, high: 15 }
  },
  complex: {
    keywords: ['refactor', 'rewrite', 'build', 'implement', 'migrate'],
    turns: { low: 15, expected: 25, high: 40 }
  }
};
```

For each turn, kerf estimates token volume based on the context overhead (ghost tokens) plus expected conversation tokens, then applies per-model pricing:

```
$ kerf estimate --compare 'refactor auth module'

  Model      Turns          Low          Expected     High
  ----------------------------------------------------------
  sonnet     15-40          $1.60        $2.62        $4.43
  opus       15-40          $8.02        $13.11       $22.17
  haiku      15-40          $0.43        $0.70        $1.18
```

Is it perfect? No. It is a heuristic. But knowing "this refactor will cost roughly $2-4 on Sonnet" versus "this will cost $8-22 on Opus" changes your decision-making. I have saved real money by checking estimates before choosing a model.

## The Attention Curve Trick

This one is subtle but powerful. Claude's attention across the context window follows a **U-shaped curve**:

```
Attention
  High │XX                                              XX│
       │  XX                                          XX  │
       │    XX                                      XX    │
  Low  │      XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX     │
       └──────────────────────────────────────────────────┘
        0%         30%         50%         70%        100%
                         Position in context
```

The first ~30% and last ~30% of the context get high attention. The middle 30-70% is a "dead zone" where Claude is more likely to miss instructions.

This matters for your CLAUDE.md file. If your critical rules (lines with NEVER, ALWAYS, MUST, CRITICAL) are sitting in the middle of the file, Claude is more likely to violate them.

`kerf audit --claude-md-only` maps each section to an attention zone and flags misplaced rules:

```
$ kerf audit --claude-md-only

  Sections:
    Project Overview        245 tokens  L1-12   [high attention]
    Conventions             110 tokens  L15-23  [dead zone] *critical rules*
    Key Paths                87 tokens  L24-30  [dead zone]
    Testing                  26 tokens  L31-35  [high attention]

  Recommendations:
    1. [HIGH] Move 3 critical rules from dead zone to top or bottom of file
```

The fix is simple: move your most important rules to the top or bottom of your CLAUDE.md. This is free -- zero cost, zero effort, measurable improvement.

## The Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| CLI framework | Commander.js | Clean subcommand routing |
| Terminal UI | Ink 5 (React 18) | Live-updating dashboard components |
| Database | better-sqlite3 | Synchronous access, fast CLI startup |
| File watching | chokidar | Cross-platform JSONL file monitoring |
| Dates | Day.js | Lightweight, immutable date operations |
| Bundler | tsup | Fast ESM bundling with shebang support |
| Testing | vitest | Fast, ESM-native test runner |

A few technical decisions worth calling out:

**Ink (React for terminals)** was the right call for the `watch` command. The live dashboard re-renders every 2 seconds as new JSONL entries appear, and React's component model maps naturally to the dashboard layout (CostMeter, ContextBar, BudgetAlert components).

**Synchronous SQLite** via `better-sqlite3` instead of async alternatives. For a CLI tool, synchronous access means no event loop overhead, faster startup, and simpler code. The budget manager does a few reads and writes -- async would add complexity with no benefit.

**Heuristic token counting** (`characters / 3.5`) instead of calling the Anthropic token counting API. This keeps the tool instant and dependency-free. When Claude Code's JSONL logs include `total_cost_usd`, kerf uses that authoritative value instead. The heuristic is only a fallback.

## What I Learned

**1. Ghost tokens are the biggest surprise for most users.** When I show people that 36% of their context is consumed before they type anything, the reaction is always the same: "Wait, what?"

**2. Estimation does not need to be exact to be useful.** A rough "this will cost $2-4" is infinitely more useful than no estimate at all. People make better decisions with ballpark numbers than with nothing.

**3. The attention curve is underappreciated.** Most CLAUDE.md files I have seen put critical rules in the middle. Moving them to the edges is the highest-leverage, lowest-effort optimization you can make.

**4. CLI tools should be instant.** Synchronous SQLite, local heuristics, no API calls for basic operations. kerf starts in milliseconds. If it took 2 seconds to show an estimate, nobody would use it.

## Get Started

```bash
npx kerf-cli@latest init      # set up database & hooks
npx kerf-cli@latest watch     # live cost dashboard
npx kerf-cli@latest audit     # find ghost token waste
npx kerf-cli@latest estimate 'your task description'
```

Or install globally:

```bash
npm i -g kerf-cli
kerf watch
```

The project is MIT licensed, has 73 tests, and is 3500+ lines of TypeScript.

- **GitHub:** [github.com/dhanushkumarsivaji/kerf-cli](https://github.com/dhanushkumarsivaji/kerf-cli)
- **npm:** [npmjs.com/package/kerf-cli](https://www.npmjs.com/package/kerf-cli)

If you use Claude Code, I would love to hear what features would be most useful. Open an issue or drop a comment here.

---

*Built by [Dhanush Kumar Sivaji](https://github.com/dhanushkumarsivaji). kerf-cli is open source under the MIT license.*
