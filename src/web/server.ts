import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import dayjs from "dayjs";
import { findJsonlFilesSync, parseSessionFile } from "../core/parser.js";
import {
  calculateMessageCost,
  formatCost,
  aggregateCosts,
} from "../core/costCalculator.js";
import { analyzeCacheUsage } from "../core/cacheAnalyzer.js";
import { analyzeCacheHealth } from "../core/cacheHealthMonitor.js";
import { detectAnomalies } from "../core/anomalyDetector.js";
import { runFullAudit } from "../audit/recommendations.js";
import type { ParsedMessage } from "../types/jsonl.js";

function getFilteredMessages(period: string): {
  allMessages: ParsedMessage[];
  sessions: Array<{ id: string; model: string; cost: number; messages: number }>;
} {
  const files = findJsonlFilesSync();
  const now = dayjs();
  let cutoff: dayjs.Dayjs;

  switch (period) {
    case "today":
      cutoff = now.startOf("day");
      break;
    case "week":
      cutoff = now.subtract(7, "day");
      break;
    case "month":
      cutoff = now.subtract(30, "day");
      break;
    case "all":
      cutoff = dayjs("2000-01-01");
      break;
    default:
      cutoff = now.startOf("day");
  }

  const allMessages: ParsedMessage[] = [];
  const sessions: Array<{ id: string; model: string; cost: number; messages: number }> = [];

  for (const file of files) {
    try {
      const session = parseSessionFile(file);
      const filtered = session.messages.filter((m) => dayjs(m.timestamp).isAfter(cutoff));
      if (filtered.length === 0) continue;

      allMessages.push(...filtered);
      const sessionCost = filtered.reduce(
        (sum, m) => sum + calculateMessageCost(m).totalCost,
        0,
      );
      sessions.push({
        id: session.sessionId,
        model: filtered[0]?.model ?? "unknown",
        cost: sessionCost,
        messages: filtered.length,
      });
    } catch {
      continue;
    }
  }

  return { allMessages, sessions };
}

function handleReport(period: string): string {
  const { allMessages, sessions } = getFilteredMessages(period);

  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const msg of allMessages) {
    totalCost += calculateMessageCost(msg).totalCost;
    totalInput += msg.usage.input_tokens;
    totalOutput += msg.usage.output_tokens;
  }

  const cache = analyzeCacheUsage(allMessages);
  const cacheHealth = analyzeCacheHealth(allMessages);
  const anomalyReport = detectAnomalies(allMessages);
  const hourly = aggregateCosts(allMessages, "hour");

  return JSON.stringify({
    period,
    totalCost,
    totalCostFormatted: formatCost(totalCost),
    totalInput,
    totalOutput,
    cacheHitRate: cache.cacheHitRate,
    cacheHealth: {
      status: cacheHealth.status,
      hitRate: cacheHealth.currentHitRate,
      estimatedWaste: cacheHealth.estimatedWaste,
      alert: cacheHealth.alert,
    },
    anomalies: anomalyReport.anomalies,
    sessionHealth: anomalyReport.sessionHealth,
    sessionCount: sessions.length,
    sessions: sessions.sort((a, b) => b.cost - a.cost),
    hourly,
  });
}

function handleAudit(): string {
  const result = runFullAudit();
  return JSON.stringify(result);
}

function handleExport(period: string, format: string): { content: string; contentType: string } {
  const { sessions } = getFilteredMessages(period);

  if (format === "csv") {
    const lines = ["session_id,model,cost_usd,messages"];
    for (const s of sessions.sort((a, b) => b.cost - a.cost)) {
      lines.push(`${s.id},${s.model},${s.cost.toFixed(4)},${s.messages}`);
    }
    return { content: lines.join("\n"), contentType: "text/csv" };
  }

  return { content: JSON.stringify(sessions), contentType: "application/json" };
}

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>kerf-cli dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .topbar { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #30363d; }
  .topbar h1 { font-size: 18px; color: #22d3ee; font-weight: 600; }
  .period-btns { display: flex; gap: 8px; }
  .period-btns button { background: #161b22; border: 1px solid #30363d; color: #e6edf3; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
  .period-btns button.active { background: #22d3ee; color: #0d1117; border-color: #22d3ee; }
  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
  .card .label { font-size: 12px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .card .value { font-size: 28px; font-weight: 700; color: #22d3ee; }
  .card .value.grade { }
  .section { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
  .section h2 { font-size: 14px; color: #8b949e; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 12px; color: #8b949e; padding: 8px 12px; border-bottom: 1px solid #30363d; }
  td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #21262d; }
  .cost { color: #22d3ee; font-weight: 600; }
  .bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .bar-label { width: 120px; font-size: 12px; color: #8b949e; text-align: right; }
  .bar-track { flex: 1; height: 20px; background: #21262d; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: #22d3ee; border-radius: 4px; transition: width 0.3s; }
  .bar-val { width: 60px; font-size: 12px; color: #e6edf3; }
  @media (max-width: 768px) { .cards { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<div id="root"></div>
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.3.1",
    "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
    "recharts": "https://esm.sh/recharts@2.15.0?external=react"
  }
}
</script>
<script type="module">
import React from "react";
import { createRoot } from "react-dom/client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const h = React.createElement;

function App() {
  const [period, setPeriod] = React.useState("today");
  const [report, setReport] = React.useState(null);
  const [audit, setAudit] = React.useState(null);

  const fetchData = React.useCallback(() => {
    fetch("/api/report?period=" + period).then(r => r.json()).then(setReport).catch(() => {});
    fetch("/api/audit").then(r => r.json()).then(setAudit).catch(() => {});
  }, [period]);

  React.useEffect(() => { fetchData(); const t = setInterval(fetchData, 10000); return () => clearInterval(t); }, [fetchData]);

  const fmtCost = (v) => v != null ? "$" + v.toFixed(2) : "$0.00";

  return h("div", null,
    h("div", { className: "topbar" },
      h("h1", null, "kerf-cli dashboard"),
      h("div", { className: "period-btns" },
        ["today", "week", "month"].map(p =>
          h("button", { key: p, className: p === period ? "active" : "", onClick: () => setPeriod(p) }, p)
        )
      )
    ),
    h("div", { className: "container" },
      // Metric cards
      h("div", { className: "cards" },
        h("div", { className: "card" },
          h("div", { className: "label" }, "Total Cost"),
          h("div", { className: "value" }, report ? fmtCost(report.totalCost) : "--")
        ),
        h("div", { className: "card" },
          h("div", { className: "label" }, "Sessions"),
          h("div", { className: "value" }, report ? report.sessionCount : "--")
        ),
        h("div", { className: "card" },
          h("div", { className: "label" }, "Cache Hit Rate"),
          h("div", { className: "value" }, report ? report.cacheHitRate.toFixed(1) + "%" : "--")
        ),
        h("div", { className: "card" },
          h("div", { className: "label" }, "Context Health"),
          h("div", { className: "value grade" }, audit ? audit.grade : "--")
        )
      ),

      // Cost over time chart
      report && report.hourly && report.hourly.length > 0 && h("div", { className: "section" },
        h("h2", null, "Cost Over Time"),
        h(ResponsiveContainer, { width: "100%", height: 250 },
          h(AreaChart, { data: report.hourly },
            h("defs", null,
              h("linearGradient", { id: "cyanGrad", x1: "0", y1: "0", x2: "0", y2: "1" },
                h("stop", { offset: "5%", stopColor: "#22d3ee", stopOpacity: 0.3 }),
                h("stop", { offset: "95%", stopColor: "#22d3ee", stopOpacity: 0 })
              )
            ),
            h(XAxis, { dataKey: "periodLabel", tick: { fill: "#8b949e", fontSize: 11 }, axisLine: false, tickLine: false }),
            h(YAxis, { tick: { fill: "#8b949e", fontSize: 11 }, axisLine: false, tickLine: false, tickFormatter: v => "$" + v.toFixed(2) }),
            h(Tooltip, { contentStyle: { background: "#161b22", border: "1px solid #30363d", borderRadius: 6, color: "#e6edf3" }, formatter: v => ["$" + v.toFixed(4), "Cost"] }),
            h(Area, { type: "monotone", dataKey: "totalCost", stroke: "#22d3ee", fill: "url(#cyanGrad)", strokeWidth: 2 })
          )
        )
      ),

      // Session table
      report && report.sessions && report.sessions.length > 0 && h("div", { className: "section" },
        h("h2", null, "Sessions"),
        h("table", null,
          h("thead", null, h("tr", null,
            h("th", null, "Session ID"),
            h("th", null, "Model"),
            h("th", null, "Messages"),
            h("th", null, "Cost")
          )),
          h("tbody", null, report.sessions.map(s =>
            h("tr", { key: s.id },
              h("td", null, s.id.slice(0, 16)),
              h("td", null, s.model.replace("claude-", "").replace(/-20\\d{6}$/, "")),
              h("td", null, s.messages),
              h("td", { className: "cost" }, fmtCost(s.cost))
            )
          ))
        )
      ),

      // Ghost token breakdown
      audit && audit.contextOverhead && h("div", { className: "section" },
        h("h2", null, "Ghost Token Breakdown"),
        (() => {
          const o = audit.contextOverhead;
          const items = [
            { label: "System Prompt", tokens: o.systemPrompt },
            { label: "Built-in Tools", tokens: o.builtInTools },
            { label: "CLAUDE.md", tokens: o.claudeMd },
            { label: "MCP Tools", tokens: o.mcpTools },
            { label: "Autocompact", tokens: o.autocompactBuffer },
          ];
          const maxTok = Math.max(...items.map(i => i.tokens), 1);
          return items.map(i =>
            h("div", { className: "bar-row", key: i.label },
              h("div", { className: "bar-label" }, i.label),
              h("div", { className: "bar-track" },
                h("div", { className: "bar-fill", style: { width: (i.tokens / maxTok * 100) + "%" } })
              ),
              h("div", { className: "bar-val" }, i.tokens.toLocaleString())
            )
          );
        })()
      )
    )
  );
}

createRoot(document.getElementById("root")).render(h(App));
</script>
</body>
</html>`;
}

function parseQuery(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const idx = url.indexOf("?");
  if (idx === -1) return params;
  const qs = url.slice(idx + 1);
  for (const pair of qs.split("&")) {
    const [k, v] = pair.split("=");
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return params;
}

function sendJson(res: ServerResponse, data: string): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(data);
}

export function startDashboardServer(port: number): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    const path = url.split("?")[0];
    const query = parseQuery(url);

    try {
      if (path === "/api/report") {
        sendJson(res, handleReport(query.period ?? "today"));
      } else if (path === "/api/audit") {
        sendJson(res, handleAudit());
      } else if (path === "/api/export") {
        const result = handleExport(query.period ?? "today", query.format ?? "csv");
        res.writeHead(200, { "Content-Type": result.contentType });
        res.end(result.content);
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(getDashboardHtml());
      }
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      console.error("Dashboard error:", err);
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  server.listen(port, () => {
    console.log(`kerf-cli dashboard running at http://localhost:${port}`);
  });
}
