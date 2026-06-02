export interface MessageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface RawJsonlMessage {
  type?: string;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    usage?: Partial<MessageUsage>;
  };
  usage?: Partial<MessageUsage>;
  timestamp?: string;
  total_cost_usd?: number;
  /** Git branch the session was on (Claude Code records this per line) */
  gitBranch?: string;
  // streaming delta events
  delta?: {
    usage?: Partial<MessageUsage>;
  };
}

export interface ParsedMessage {
  id: string;
  sessionId: string;
  model: string;
  timestamp: string;
  usage: MessageUsage;
  totalCostUsd: number | null;
  /** Git branch this message was recorded on, if the tool reports it. */
  gitBranch?: string | null;
}

export interface SessionData {
  sessionId: string;
  filePath: string;
  messages: ParsedMessage[];
  startTime: string;
  endTime: string;
  lastModified: Date;
}

export interface ParsedSession {
  sessionId: string;
  filePath: string;
  messages: ParsedMessage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  startTime: string;
  endTime: string;
  messageCount: number;
}
