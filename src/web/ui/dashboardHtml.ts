// The polished dashboard HTML — a single-file React SPA that loads
// React + Recharts via importmap from esm.sh. Embedded as a TS string
// so it bundles cleanly with tsup (no separate static asset pipeline).

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="kerf — cost intelligence for Claude Code" />
  <meta name="theme-color" content="#08090a" />
  <title>kerf · cost intelligence</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%235e6ad2'/%3E%3Ctext x='50' y='72' text-anchor='middle' font-family='-apple-system,sans-serif' font-size='64' font-weight='700' fill='white'%3Ek%3C/text%3E%3C/svg%3E" />
  <style>
    :root {
      --color-bg-base: #08090a;
      --color-bg-surface: #0f1011;
      --color-bg-elevated: #16181a;
      --color-bg-hover: #1c1e22;
      --color-border-subtle: #1f2125;
      --color-border-default: #2a2d33;
      --color-border-strong: #3a3d44;
      --color-text-primary: #f4f5f7;
      --color-text-secondary: #9ca3af;
      --color-text-tertiary: #6b7280;
      --color-text-disabled: #4b5563;
      --color-accent: #5e6ad2;
      --color-accent-hover: #7170ff;
      --color-accent-bg: rgba(94, 106, 210, 0.12);
      --color-success: #4ade80;
      --color-success-bg: rgba(74, 222, 128, 0.1);
      --color-warning: #fbbf24;
      --color-warning-bg: rgba(251, 191, 36, 0.1);
      --color-danger: #f87171;
      --color-danger-bg: rgba(248, 113, 113, 0.1);
      --color-model-opus: #c084fc;
      --color-model-sonnet: #60a5fa;
      --color-model-haiku: #34d399;
      --color-model-other: #6b7280;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
      --font-mono: 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
      --space-8: 32px;
      --space-10: 40px;
      --space-12: 48px;
      --radius-md: 6px;
      --radius-lg: 8px;
      --radius-xl: 12px;
      --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
      --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
      --duration-fast: 120ms;
      --duration-normal: 200ms;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: var(--color-bg-base);
      color: var(--color-text-primary);
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    button { font-family: inherit; cursor: pointer; }
    a { color: var(--color-accent); text-decoration: none; }
    a:hover { color: var(--color-accent-hover); }

    .app { max-width: 1280px; margin: 0 auto; padding: var(--space-6); }

    /* Hero header */
    .hero {
      position: sticky; top: 0; z-index: 10;
      background: rgba(8, 9, 10, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--color-border-subtle);
      margin: calc(-1 * var(--space-6)) calc(-1 * var(--space-6)) var(--space-6);
      padding: var(--space-6);
    }
    .hero-top {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: var(--space-5);
    }
    .logo { display: flex; align-items: center; gap: var(--space-3); }
    .logo-mark {
      width: 32px; height: 32px; border-radius: var(--radius-md);
      background: var(--color-accent);
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: 18px;
    }
    .logo-text {
      font-size: 18px; font-weight: 600; letter-spacing: -0.02em;
      color: var(--color-text-primary);
    }
    .logo-subtitle {
      font-size: 12px; color: var(--color-text-secondary);
      margin-top: 2px;
    }

    .period-picker { display: flex; gap: 2px; background: var(--color-bg-surface); padding: 3px; border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); }
    .period-btn {
      background: transparent; border: none; color: var(--color-text-secondary);
      padding: 6px 14px; font-size: 12px; font-weight: 500;
      border-radius: 4px; transition: all var(--duration-fast) var(--ease-out);
    }
    .period-btn:hover { color: var(--color-text-primary); }
    .period-btn.active {
      background: var(--color-bg-elevated); color: var(--color-text-primary);
      box-shadow: 0 1px 2px rgba(0,0,0,0.4);
    }

    .hero-metrics {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-6);
    }
    @media (max-width: 900px) { .hero-metrics { grid-template-columns: repeat(2, 1fr); } }

    .metric { display: flex; flex-direction: column; }
    .metric-value {
      font-size: 36px; font-weight: 700; line-height: 1.1;
      letter-spacing: -0.03em; color: var(--color-text-primary);
      font-variant-numeric: tabular-nums;
    }
    .metric-label {
      font-size: 11px; color: var(--color-text-secondary);
      text-transform: uppercase; letter-spacing: 0.05em;
      margin-top: var(--space-2); font-weight: 500;
    }
    .metric-change {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 12px; font-weight: 600; margin-left: var(--space-2);
    }
    .metric-change.up { color: var(--color-danger); }
    .metric-change.down { color: var(--color-success); }
    .metric-change.flat { color: var(--color-text-tertiary); }

    /* Killer features grid */
    .killer-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4);
      margin-bottom: var(--space-6);
    }
    @media (max-width: 900px) { .killer-grid { grid-template-columns: 1fr; } }

    .card {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
      transition: border-color var(--duration-fast) var(--ease-out);
    }
    .card:hover { border-color: var(--color-border-default); }
    .card.warning { background: var(--color-warning-bg); border-color: rgba(251, 191, 36, 0.3); }
    .card.danger { background: var(--color-danger-bg); border-color: rgba(248, 113, 113, 0.3); }

    .card-title {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 11px; font-weight: 600; color: var(--color-text-secondary);
      text-transform: uppercase; letter-spacing: 0.05em;
      margin-bottom: var(--space-3);
    }
    .card-big-number {
      font-size: 28px; font-weight: 700; line-height: 1.1;
      letter-spacing: -0.03em; color: var(--color-text-primary);
      font-variant-numeric: tabular-nums;
    }
    .card-subtitle {
      font-size: 12px; color: var(--color-text-secondary); margin-top: var(--space-1);
    }
    .card-footer {
      font-size: 11px; color: var(--color-text-tertiary); margin-top: var(--space-3);
      padding-top: var(--space-3); border-top: 1px solid var(--color-border-subtle);
    }

    .progress-bar {
      width: 100%; height: 6px; background: var(--color-bg-elevated);
      border-radius: 3px; margin-top: var(--space-3); overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%; transition: width var(--duration-normal) var(--ease-out);
      border-radius: 3px;
    }

    .stacked-bar {
      width: 100%; height: 8px; background: var(--color-bg-elevated);
      border-radius: 4px; margin-top: var(--space-3); overflow: hidden;
      display: flex;
    }
    .stacked-bar-segment {
      height: 100%; transition: width var(--duration-normal) var(--ease-out);
    }

    /* Section + chart */
    .section {
      background: var(--color-bg-surface);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-6);
      overflow: hidden;
    }
    .section-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: var(--space-5) var(--space-5) var(--space-3);
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .section-title {
      font-size: 13px; font-weight: 600; color: var(--color-text-primary);
    }
    .section-body { padding: var(--space-5); }

    /* Session table */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      text-align: left; font-size: 11px; font-weight: 600;
      color: var(--color-text-secondary); text-transform: uppercase;
      letter-spacing: 0.05em; padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border-subtle);
      background: var(--color-bg-surface);
      cursor: pointer; user-select: none;
    }
    thead th:hover { color: var(--color-text-primary); }
    thead th.numeric, td.numeric { text-align: right; font-variant-numeric: tabular-nums; }
    tbody tr {
      border-bottom: 1px solid var(--color-border-subtle);
      transition: background var(--duration-fast) var(--ease-out);
    }
    tbody tr:hover { background: var(--color-bg-hover); }
    tbody td {
      padding: var(--space-3) var(--space-4);
      font-size: 12px; color: var(--color-text-primary);
    }
    .pill {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .pill.opus { background: rgba(192, 132, 252, 0.15); color: var(--color-model-opus); }
    .pill.sonnet { background: rgba(96, 165, 250, 0.15); color: var(--color-model-sonnet); }
    .pill.haiku { background: rgba(52, 211, 153, 0.15); color: var(--color-model-haiku); }
    .pill.other { background: rgba(107, 114, 128, 0.15); color: var(--color-model-other); }

    .cost-text { font-family: var(--font-mono); font-weight: 600; }

    /* Empty state */
    .empty {
      text-align: center; padding: var(--space-12) var(--space-6);
    }
    .empty-icon {
      width: 48px; height: 48px; margin: 0 auto var(--space-4);
      background: var(--color-accent-bg); border-radius: var(--radius-lg);
      display: flex; align-items: center; justify-content: center;
      color: var(--color-accent); font-size: 24px;
    }
    .empty-title { font-size: 16px; font-weight: 600; margin-bottom: var(--space-2); }
    .empty-body { font-size: 13px; color: var(--color-text-secondary); max-width: 420px; margin: 0 auto var(--space-5); }
    .button-primary {
      background: var(--color-accent); color: white;
      border: none; padding: 10px 20px; border-radius: var(--radius-md);
      font-size: 13px; font-weight: 500;
      transition: background var(--duration-fast) var(--ease-out);
    }
    .button-primary:hover { background: var(--color-accent-hover); }

    /* Live indicator */
    .live-indicator {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px; color: var(--color-text-secondary);
      padding: 4px 10px; background: var(--color-bg-surface);
      border: 1px solid var(--color-border-subtle); border-radius: 12px;
    }
    .live-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--color-success);
      animation: pulse 2s var(--ease-out) infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Skeleton */
    .skel { background: var(--color-bg-elevated); border-radius: 4px; animation: skel 1.5s ease-in-out infinite; }
    @keyframes skel {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.8; }
    }
  </style>
</head>
<body>
  <div id="root"></div>

  <script type="importmap">
    {
      "imports": {
        "react": "https://esm.sh/react@18.3.1",
        "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
        "react-dom/client": "https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1",
        "recharts": "https://esm.sh/recharts@2.15.0?deps=react@18.3.1,react-dom@18.3.1&external=react,react-dom"
      }
    }
  </script>

  <script type="module">
    import React, { useState, useEffect, useMemo } from 'react';
    import { createRoot } from 'react-dom/client';
    import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

    const e = React.createElement;

    const fmtCost = (n) => {
      if (n == null) return '$0.00';
      if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
      return '$' + n.toFixed(2);
    };
    const fmtTokens = (n) => {
      if (n == null || n === 0) return '0';
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
      return String(n);
    };
    const fmtPct = (n) => (n * 100).toFixed(0) + '%';
    const fmtRel = (iso) => {
      if (!iso) return '';
      const ms = Date.now() - new Date(iso).getTime();
      const s = ms / 1000;
      if (s < 60) return Math.floor(s) + 's ago';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    };
    const modelClass = (m) => {
      if (!m) return 'other';
      const lower = m.toLowerCase();
      if (lower.includes('opus')) return 'opus';
      if (lower.includes('sonnet')) return 'sonnet';
      if (lower.includes('haiku')) return 'haiku';
      return 'other';
    };
    const shortModel = (m) => {
      if (!m) return '?';
      return m.replace('claude-', '').replace(/-\\d{8}.*/, '');
    };

    function useApi(url) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);
      useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetch(url)
          .then((r) => r.json())
          .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
          .catch((err) => { if (!cancelled) { setError(err); setLoading(false); } });
        return () => { cancelled = true; };
      }, [url]);
      return { data, loading, error };
    }

    function PeriodPicker({ period, setPeriod }) {
      const periods = [['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['all', 'All']];
      return e('div', { className: 'period-picker' },
        periods.map(([k, l]) =>
          e('button', {
            key: k,
            className: 'period-btn' + (k === period ? ' active' : ''),
            onClick: () => setPeriod(k),
          }, l)
        )
      );
    }

    function Hero({ period, setPeriod, report }) {
      const cost = report?.totalCost ?? 0;
      const sessions = report?.totalSessions ?? 0;
      const tokens = (report?.totalInputTokens ?? 0) + (report?.totalOutputTokens ?? 0) + (report?.totalCacheRead ?? 0);
      const cacheRate = report?.cacheHitRate ?? 0;
      const trend = report?.costTrend ?? { percentChange: 0 };
      const change = trend.percentChange;
      const changeClass = Math.abs(change) < 0.1 ? 'flat' : change > 0 ? 'up' : 'down';
      const changeIcon = Math.abs(change) < 0.1 ? '–' : change > 0 ? '↑' : '↓';

      return e('div', { className: 'hero' },
        e('div', { className: 'hero-top' },
          e('div', { className: 'logo' },
            e('div', { className: 'logo-mark' }, 'k'),
            e('div', null,
              e('div', { className: 'logo-text' }, 'kerf'),
              e('div', { className: 'logo-subtitle' }, 'cost intelligence for Claude Code')
            )
          ),
          e('div', { style: { display: 'flex', gap: 'var(--space-3)', alignItems: 'center' } },
            e('span', { className: 'live-indicator' },
              e('span', { className: 'live-dot' }),
              'Live'
            ),
            e(PeriodPicker, { period, setPeriod })
          )
        ),
        e('div', { className: 'hero-metrics' },
          e('div', { className: 'metric' },
            e('div', null,
              e('span', { className: 'metric-value' }, fmtCost(cost)),
              report?.costTrend && period !== 'all' ? e('span', { className: 'metric-change ' + changeClass },
                changeIcon + ' ' + Math.abs(change).toFixed(0) + '%'
              ) : null
            ),
            e('div', { className: 'metric-label' }, 'Spent ' + period)
          ),
          e('div', { className: 'metric' },
            e('div', { className: 'metric-value' }, sessions.toLocaleString()),
            e('div', { className: 'metric-label' }, 'Sessions')
          ),
          e('div', { className: 'metric' },
            e('div', { className: 'metric-value' }, fmtTokens(tokens)),
            e('div', { className: 'metric-label' }, 'Tokens')
          ),
          e('div', { className: 'metric' },
            e('div', { className: 'metric-value' }, fmtPct(cacheRate)),
            e('div', { className: 'metric-label' }, 'Cache hit rate')
          )
        )
      );
    }

    function BudgetCard({ status }) {
      if (!status) {
        return e('div', { className: 'card' },
          e('div', { className: 'card-title' }, 'Budget'),
          e('div', { className: 'card-big-number', style: { fontSize: '18px', color: 'var(--color-text-secondary)' } }, 'No budget set'),
          e('div', { className: 'card-subtitle' }, 'Run \`kerf budget set 50 --period weekly\` to set one'),
        );
      }
      const pct = status.percentUsed ?? 0;
      const color = pct >= 100 ? 'var(--color-danger)' : pct >= 80 ? 'var(--color-warning)' : 'var(--color-success)';
      const cardClass = 'card' + (pct >= 100 ? ' danger' : pct >= 80 ? ' warning' : '');
      return e('div', { className: cardClass },
        e('div', { className: 'card-title' }, 'Budget'),
        e('div', { className: 'card-big-number' }, pct.toFixed(0) + '%'),
        e('div', { className: 'card-subtitle' }, fmtCost(status.spent) + ' of ' + fmtCost(status.budget)),
        e('div', { className: 'progress-bar' },
          e('div', { className: 'progress-bar-fill', style: { width: Math.min(100, pct) + '%', background: color } })
        ),
        e('div', { className: 'card-footer' }, fmtCost(status.remaining) + ' remaining · ' + status.period)
      );
    }

    function EfficiencyCard({ efficiency }) {
      if (!efficiency) return null;
      const total = efficiency.totalCostUsd ?? 0;
      const savings = efficiency.estimatedSavings?.switchOpusToSonnet?.savedUsd ?? 0;
      const breakdown = efficiency.byModel ?? [];
      return e('div', { className: 'card' },
        e('div', { className: 'card-title' }, 'Model efficiency'),
        e('div', { className: 'card-big-number' }, fmtCost(savings) + '/mo'),
        e('div', { className: 'card-subtitle' }, 'Potential savings · Opus → Sonnet'),
        e('div', { className: 'stacked-bar' },
          breakdown.map((m, i) => {
            const color = m.model === 'opus' ? 'var(--color-model-opus)' :
                          m.model === 'sonnet' ? 'var(--color-model-sonnet)' :
                          m.model === 'haiku' ? 'var(--color-model-haiku)' : 'var(--color-model-other)';
            return e('div', {
              key: i,
              className: 'stacked-bar-segment',
              style: { width: m.percentOfTotal + '%', background: color },
              title: m.model + ': ' + fmtCost(m.costUsd),
            });
          })
        ),
        e('div', { className: 'card-footer' },
          breakdown.slice(0, 3).map((m, i) => i === 0 ? m.percentOfTotal.toFixed(0) + '% ' + m.model : ' · ' + m.percentOfTotal.toFixed(0) + '% ' + m.model)
        )
      );
    }

    function CacheCard({ cache }) {
      if (!cache) return null;
      const rate = cache.cacheHitRate ?? 0;
      const data = [
        { name: 'Cache hits', value: cache.totalCacheReadTokens ?? 0 },
        { name: 'Fresh', value: cache.totalInputTokens ?? 0 },
      ];
      const cardClass = 'card' + (rate < 0.5 && rate > 0 ? ' warning' : '');
      return e('div', { className: cardClass },
        e('div', { className: 'card-title' }, 'Cache hit rate'),
        e('div', { className: 'card-big-number' }, fmtPct(rate)),
        e('div', { className: 'card-subtitle' }, 'Tokens served from cache'),
        e('div', { style: { marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } },
          e('div', { style: { flex: '0 0 60px', height: 60 } },
            e(ResponsiveContainer, null,
              e(PieChart, null,
                e(Pie, { data, dataKey: 'value', innerRadius: 18, outerRadius: 28, startAngle: 90, endAngle: -270 },
                  e(Cell, { fill: 'var(--color-success)' }),
                  e(Cell, { fill: 'var(--color-bg-elevated)' })
                )
              )
            )
          ),
          e('div', { style: { flex: 1, fontSize: 11, color: 'var(--color-text-secondary)' } },
            'Saved ' + fmtCost(cache.savingsFromCache ?? 0),
            e('br'),
            'Could save ' + fmtCost(cache.potentialAdditionalSavings ?? 0) + ' more at 80%'
          )
        )
      );
    }

    function CostChart({ costTrend, period }) {
      if (!costTrend || costTrend.length === 0) {
        return e('div', { className: 'empty' },
          e('div', { className: 'empty-icon' }, '∅'),
          e('div', { className: 'empty-title' }, 'No data yet'),
          e('div', { className: 'empty-body' }, 'Run \`kerf sync\` to ingest your Claude Code sessions, then come back.')
        );
      }
      return e('div', { style: { width: '100%', height: 280 } },
        e(ResponsiveContainer, null,
          e(AreaChart, { data: costTrend, margin: { top: 10, right: 10, left: 0, bottom: 0 } },
            e('defs', null,
              e('linearGradient', { id: 'opusGrad', x1: 0, y1: 0, x2: 0, y2: 1 },
                e('stop', { offset: '5%', stopColor: 'var(--color-model-opus)', stopOpacity: 0.6 }),
                e('stop', { offset: '95%', stopColor: 'var(--color-model-opus)', stopOpacity: 0 })
              ),
              e('linearGradient', { id: 'sonnetGrad', x1: 0, y1: 0, x2: 0, y2: 1 },
                e('stop', { offset: '5%', stopColor: 'var(--color-model-sonnet)', stopOpacity: 0.6 }),
                e('stop', { offset: '95%', stopColor: 'var(--color-model-sonnet)', stopOpacity: 0 })
              ),
              e('linearGradient', { id: 'haikuGrad', x1: 0, y1: 0, x2: 0, y2: 1 },
                e('stop', { offset: '5%', stopColor: 'var(--color-model-haiku)', stopOpacity: 0.6 }),
                e('stop', { offset: '95%', stopColor: 'var(--color-model-haiku)', stopOpacity: 0 })
              )
            ),
            e(CartesianGrid, { strokeDasharray: '3 3', stroke: 'var(--color-border-subtle)' }),
            e(XAxis, { dataKey: 'bucket', stroke: 'var(--color-text-tertiary)', fontSize: 10, tickFormatter: (v) => v.slice(-5) }),
            e(YAxis, { stroke: 'var(--color-text-tertiary)', fontSize: 10, tickFormatter: (v) => '$' + v.toFixed(0) }),
            e(Tooltip, {
              contentStyle: { background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-default)', borderRadius: 6, fontSize: 12 },
              formatter: (v) => fmtCost(v),
            }),
            e(Area, { type: 'monotone', dataKey: 'opus', stackId: '1', stroke: 'var(--color-model-opus)', fill: 'url(#opusGrad)', strokeWidth: 2 }),
            e(Area, { type: 'monotone', dataKey: 'sonnet', stackId: '1', stroke: 'var(--color-model-sonnet)', fill: 'url(#sonnetGrad)', strokeWidth: 2 }),
            e(Area, { type: 'monotone', dataKey: 'haiku', stackId: '1', stroke: 'var(--color-model-haiku)', fill: 'url(#haikuGrad)', strokeWidth: 2 })
          )
        )
      );
    }

    function SessionTable({ sessions }) {
      const [expanded, setExpanded] = useState(null);
      if (!sessions || sessions.length === 0) {
        return e('div', { className: 'empty' },
          e('div', { className: 'empty-icon' }, '∅'),
          e('div', { className: 'empty-title' }, 'No sessions yet'),
          e('div', { className: 'empty-body' }, 'Use Claude Code to create some sessions, then click sync.')
        );
      }
      const projectName = (path) => {
        const parts = path.split('/');
        return parts[parts.length - 1] || path;
      };
      return e('div', { className: 'table-wrap' },
        e('table', null,
          e('thead', null,
            e('tr', null,
              e('th', null, 'When'),
              e('th', null, 'Project'),
              e('th', null, 'Models'),
              e('th', { className: 'numeric' }, 'Msgs'),
              e('th', { className: 'numeric' }, 'Tokens'),
              e('th', { className: 'numeric' }, 'Cost')
            )
          ),
          e('tbody', null,
            sessions.map((s) => {
              const tokens = s.totalInputTokens + s.totalOutputTokens + s.totalCacheRead;
              return e(React.Fragment, { key: s.sessionId },
                e('tr', { onClick: () => setExpanded(expanded === s.sessionId ? null : s.sessionId), style: { cursor: 'pointer' } },
                  e('td', null, fmtRel(s.lastMessageAt)),
                  e('td', { title: s.projectPath }, projectName(s.projectPath)),
                  e('td', null,
                    s.models.slice(0, 3).map((m, i) => e('span', { key: i, className: 'pill ' + modelClass(m), style: { marginRight: 4 } }, shortModel(m)))
                  ),
                  e('td', { className: 'numeric' }, s.messageCount),
                  e('td', { className: 'numeric' }, fmtTokens(tokens)),
                  e('td', { className: 'numeric cost-text' }, fmtCost(s.totalCostUsd))
                ),
                expanded === s.sessionId ? e('tr', null,
                  e('td', { colSpan: 6, style: { background: 'var(--color-bg-base)', padding: 'var(--space-4)', fontSize: 11, color: 'var(--color-text-secondary)' } },
                    e('div', null, 'Session ID: ', e('span', { style: { fontFamily: 'var(--font-mono)' } }, s.sessionId)),
                    e('div', { style: { marginTop: 4 } }, 'Path: ', s.projectPath),
                    e('div', { style: { marginTop: 4 } }, 'Started: ', s.firstMessageAt, ' · Ended: ', s.lastMessageAt),
                    e('div', { style: { marginTop: 4 } },
                      'In: ', fmtTokens(s.totalInputTokens), ' · Out: ', fmtTokens(s.totalOutputTokens),
                      ' · Cache R: ', fmtTokens(s.totalCacheRead), ' · Cache W: ', fmtTokens(s.totalCacheCreation)
                    )
                  )
                ) : null
              );
            })
          )
        )
      );
    }

    function App() {
      const [period, setPeriod] = useState('today');
      const reportApi = useApi('/api/report?period=' + period);
      const trendApi = useApi('/api/cost-trend?period=' + period);
      const sessionsApi = useApi('/api/sessions?limit=20&sort=recent&order=desc');
      const budgetApi = useApi('/api/budget');

      // Auto-refresh every 5 seconds
      const [, setTick] = useState(0);
      useEffect(() => {
        const t = setInterval(() => setTick((x) => x + 1), 5000);
        return () => clearInterval(t);
      }, []);

      const report = reportApi.data;
      const sessions = sessionsApi.data?.sessions ?? [];

      const isEmpty = !reportApi.loading && (!report || report.totalSessions === 0);
      if (isEmpty) {
        return e('div', { className: 'app' },
          e(Hero, { period, setPeriod, report: { totalCost: 0, totalSessions: 0, totalInputTokens: 0, totalOutputTokens: 0, cacheHitRate: 0, costTrend: { percentChange: 0 } } }),
          e('div', { className: 'section' },
            e('div', { className: 'empty', style: { padding: 'var(--space-12) var(--space-6)' } },
              e('div', { className: 'empty-icon', style: { width: 64, height: 64, fontSize: 32 } }, '✦'),
              e('div', { className: 'empty-title', style: { fontSize: 20 } }, 'Welcome to kerf'),
              e('div', { className: 'empty-body' },
                'Kerf reads your Claude Code session history to give you cost intelligence and budget control. To get started, just use Claude Code as usual — kerf will pick up your sessions automatically.'
              ),
              e('button', {
                className: 'button-primary',
                onClick: () => fetch('/api/sync', { method: 'POST' }).then(() => location.reload()),
              }, 'Sync now')
            )
          )
        );
      }

      return e('div', { className: 'app' },
        e(Hero, { period, setPeriod, report }),

        e('div', { className: 'killer-grid' },
          e(BudgetCard, { status: budgetApi.data?.status }),
          e(EfficiencyCard, { efficiency: report?.efficiency }),
          e(CacheCard, { cache: report?.cache })
        ),

        e('div', { className: 'section' },
          e('div', { className: 'section-header' },
            e('div', { className: 'section-title' }, 'Cost over time'),
          ),
          e('div', { className: 'section-body' },
            e(CostChart, { costTrend: trendApi.data, period })
          )
        ),

        e('div', { className: 'section' },
          e('div', { className: 'section-header' },
            e('div', { className: 'section-title' }, 'Recent sessions'),
            e('div', { style: { fontSize: 11, color: 'var(--color-text-tertiary)' } }, sessionsApi.data?.total ?? 0, ' total')
          ),
          e(SessionTable, { sessions })
        ),

        e('div', { style: { textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-tertiary)', fontSize: 11 } },
          'kerf-cli · local-only · ',
          e('a', { href: 'https://github.com/dhanushkumarsivaji/kerf-cli', target: '_blank' }, 'github.com/dhanushkumarsivaji/kerf-cli')
        )
      );
    }

    createRoot(document.getElementById('root')).render(e(App));
  </script>
</body>
</html>
`;
