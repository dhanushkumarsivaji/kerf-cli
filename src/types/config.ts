export interface KerfConfig {
  defaultModel: "sonnet" | "opus" | "haiku";
  budgetWarningThreshold: number; // percentage (0-100)
  budgetBlockThreshold: number;   // percentage (0-100)
  pollingInterval: number;        // milliseconds
  dataDir: string;                // default: ~/.kerf
  enableHooks: boolean;
}

export interface ContextOverhead {
  systemPrompt: number;
  builtInTools: number;
  claudeMd: number;
  mcpTools: number;
  autocompactBuffer: number;
  totalOverhead: number;
  effectiveWindow: number;
  percentUsable: number;
}

export interface CostEstimate {
  model: string;
  estimatedTurns: { low: number; expected: number; high: number };
  estimatedTokens: { input: number; output: number; cached: number };
  estimatedCost: { low: string; expected: string; high: string };
  contextOverhead: number;
  fileTokens: number;
  percentOfWindow: number;
  recommendations: string[];
}

export interface EstimateOptions {
  model: "sonnet" | "opus" | "haiku";
  files: string[];
  cwd: string;
}

export interface BudgetStatus {
  budget: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
  period: "daily" | "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
}

export interface McpServerInfo {
  name: string;
  toolCount: number;
  estimatedTokens: number;
  isHeavy: boolean;
}

export interface AuditResult {
  grade: "A" | "B" | "C" | "D";
  contextOverhead: ContextOverhead;
  claudeMdAnalysis: ClaudeMdAnalysis | null;
  mcpServers: McpServerInfo[];
  recommendations: AuditRecommendation[];
}

export interface ClaudeMdSection {
  title: string;
  content: string;
  tokens: number;
  lineStart: number;
  lineEnd: number;
  hasCriticalRules: boolean;
  attentionZone: "high-start" | "low-middle" | "high-end";
}

export interface ClaudeMdAnalysis {
  totalLines: number;
  totalTokens: number;
  sections: ClaudeMdSection[];
  criticalRulesInDeadZone: number;
  isOverLineLimit: boolean;
  suggestedReorder: string[];
}

export interface AuditRecommendation {
  priority: "high" | "medium" | "low";
  impact: string;
  action: string;
  category: "claude-md" | "mcp" | "ghost-tokens" | "general";
}
