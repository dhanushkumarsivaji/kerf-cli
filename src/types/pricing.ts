export interface ModelPricing {
  input: number;       // per million tokens
  output: number;      // per million tokens
  cacheRead: number;   // per million tokens
  cacheCreation: number; // per million tokens
}

export type ModelName = string;

export interface PricingConfig {
  [model: string]: ModelPricing;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheCreationCost: number;
  totalCost: number;
}

export interface SessionCostSummary {
  sessionId: string;
  totalCost: number;
  tokenBreakdown: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  };
  costBreakdown: CostBreakdown;
  model: string;
  messageCount: number;
  startTime: string;
  endTime: string;
}

export interface CostVelocity {
  dollarsPerMinute: number;
  tokensPerMinute: number;
  projectedWindowCost: number;
  minutesRemaining: number;
}

export type AggregationPeriod = "session" | "hour" | "day" | "billing_window" | "week" | "month";

export interface AggregatedCost {
  period: string;
  periodLabel: string;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  messageCount: number;
  sessionCount: number;
}
