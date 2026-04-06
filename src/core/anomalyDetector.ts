import { calculateMessageCost, formatCost } from "./costCalculator.js";
import type { ParsedMessage } from "../types/jsonl.js";

export interface TokenAnomaly {
  type: 'cost_spike' | 'cache_drop' | 'resume_bloat' | 'input_explosion' | 'thinking_bloat';
  severity: 'warning' | 'critical';
  turnNumber: number;
  messageId: string;
  description: string;
  metric: number;
  expectedRange: string;
  recommendation: string;
}

export interface AnomalyReport {
  anomalies: TokenAnomaly[];
  sessionHealth: 'normal' | 'suspicious' | 'critical';
}

export function calculateCacheRatio(msg: ParsedMessage): number {
  const { cache_read_input_tokens, cache_creation_input_tokens, input_tokens } = msg.usage;
  const total = cache_read_input_tokens + cache_creation_input_tokens + input_tokens;
  if (total === 0) return 0;
  return cache_read_input_tokens / total;
}

export function detectAnomalies(messages: ParsedMessage[]): AnomalyReport {
  const anomalies: TokenAnomaly[] = [];

  if (messages.length === 0) {
    return { anomalies, sessionHealth: 'normal' };
  }

  // Filter to substantive messages only — skip streaming deltas and tiny intermediate messages
  // A substantive message has meaningful token counts (not just output_tokens: 1 or input_tokens: 0)
  const substantive = messages.filter((m) => {
    const totalTokens = m.usage.input_tokens + m.usage.output_tokens + m.usage.cache_read_input_tokens + m.usage.cache_creation_input_tokens;
    return totalTokens > 100;
  });

  if (substantive.length < 3) {
    return { anomalies, sessionHealth: 'normal' };
  }

  // Compute per-message costs
  const costs = substantive.map((msg) => calculateMessageCost(msg).totalCost);

  // Session averages skip the first 2 substantive messages (cold starts)
  const steadyState = substantive.slice(2);
  const steadyCosts = costs.slice(2);

  const avgCost = steadyCosts.length > 0
    ? steadyCosts.reduce((a, b) => a + b, 0) / steadyCosts.length
    : 0;

  const avgInput = steadyState.length > 0
    ? steadyState.reduce((sum, m) => sum + m.usage.input_tokens, 0) / steadyState.length
    : 0;

  for (let i = 0; i < substantive.length; i++) {
    const msg = substantive[i];
    const cost = costs[i];
    const turnNumber = messages.indexOf(msg) + 1;

    // 1. Cost spike: turn cost >3x session average (only when average is meaningful)
    if (avgCost > 0.01 && i >= 2) {
      const ratio = cost / avgCost;
      if (ratio > 5) {
        anomalies.push({
          type: 'cost_spike',
          severity: 'critical',
          turnNumber,
          messageId: msg.id,
          description: `Turn cost ${formatCost(cost)} is ${ratio.toFixed(1)}x the session average of ${formatCost(avgCost)}`,
          metric: ratio,
          expectedRange: `< ${formatCost(avgCost * 3)}`,
          recommendation: 'Investigate this turn for unnecessary tool calls or large file reads',
        });
      } else if (ratio > 3) {
        anomalies.push({
          type: 'cost_spike',
          severity: 'warning',
          turnNumber,
          messageId: msg.id,
          description: `Turn cost ${formatCost(cost)} is ${ratio.toFixed(1)}x the session average of ${formatCost(avgCost)}`,
          metric: ratio,
          expectedRange: `< ${formatCost(avgCost * 3)}`,
          recommendation: 'Review this turn for potential cost optimization',
        });
      }
    }

    // 2. Cache drop: ratio drops from >70% to <20% — only between substantive messages
    if (i > 0) {
      const prevRatio = calculateCacheRatio(substantive[i - 1]);
      const currRatio = calculateCacheRatio(msg);
      if (prevRatio > 0.7 && currRatio < 0.2) {
        anomalies.push({
          type: 'cache_drop',
          severity: 'critical',
          turnNumber,
          messageId: msg.id,
          description: `Cache ratio dropped from ${(prevRatio * 100).toFixed(0)}% to ${(currRatio * 100).toFixed(0)}%`,
          metric: currRatio,
          expectedRange: '> 20% when previous turn was > 70%',
          recommendation: 'Cache may have been evicted — consider shorter sessions or reducing context size',
        });
      }
    }

    // 3. Input explosion: input tokens >2.5x average — only when average is meaningful (>1000)
    if (avgInput > 1000 && i >= 2) {
      const inputRatio = msg.usage.input_tokens / avgInput;
      if (inputRatio > 2.5) {
        anomalies.push({
          type: 'input_explosion',
          severity: 'warning',
          turnNumber,
          messageId: msg.id,
          description: `Input tokens ${msg.usage.input_tokens.toLocaleString()} is ${inputRatio.toFixed(1)}x the session average of ${Math.round(avgInput).toLocaleString()}`,
          metric: inputRatio,
          expectedRange: `< ${Math.round(avgInput * 2.5).toLocaleString()} tokens`,
          recommendation: 'Check for large file reads or excessive context being sent',
        });
      }
    }

    // 4. Thinking bloat: output tokens >30K
    if (msg.usage.output_tokens > 30_000) {
      anomalies.push({
        type: 'thinking_bloat',
        severity: 'warning',
        turnNumber,
        messageId: msg.id,
        description: `Output tokens ${msg.usage.output_tokens.toLocaleString()} exceeds 30K threshold`,
        metric: msg.usage.output_tokens,
        expectedRange: '< 30,000 tokens',
        recommendation: 'Consider breaking complex tasks into smaller steps to reduce output size',
      });
    }

    // 5. Resume bloat: first substantive turn >50K output tokens
    if (i === 0 && msg.usage.output_tokens > 50_000) {
      anomalies.push({
        type: 'resume_bloat',
        severity: 'critical',
        turnNumber,
        messageId: msg.id,
        description: `First turn produced ${msg.usage.output_tokens.toLocaleString()} output tokens`,
        metric: msg.usage.output_tokens,
        expectedRange: '< 50,000 tokens for first turn',
        recommendation: 'Session resume may be re-generating excessive context — consider starting a fresh session',
      });
    }
  }

  // Determine session health
  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
  let sessionHealth: AnomalyReport['sessionHealth'];
  if (criticalCount >= 2) {
    sessionHealth = 'critical';
  } else if (anomalies.length > 0) {
    sessionHealth = 'suspicious';
  } else {
    sessionHealth = 'normal';
  }

  return { anomalies, sessionHealth };
}
