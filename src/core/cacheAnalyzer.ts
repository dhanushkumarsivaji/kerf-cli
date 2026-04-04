import type { ParsedMessage } from "../types/jsonl.js";

export interface CacheAnalysis {
  totalCacheReads: number;
  totalCacheCreations: number;
  totalInputTokens: number;
  cacheHitRate: number;
  estimatedSavings: number;
  perMessageBreakdown: Array<{
    id: string;
    cacheRead: number;
    cacheCreation: number;
    input: number;
    hitRate: number;
  }>;
}

/**
 * Analyze prompt cache hit/miss patterns
 */
export function analyzeCacheUsage(messages: ParsedMessage[]): CacheAnalysis {
  let totalCacheReads = 0;
  let totalCacheCreations = 0;
  let totalInputTokens = 0;

  const perMessage = messages.map((msg) => {
    const cacheRead = msg.usage.cache_read_input_tokens;
    const cacheCreation = msg.usage.cache_creation_input_tokens;
    const input = msg.usage.input_tokens;

    totalCacheReads += cacheRead;
    totalCacheCreations += cacheCreation;
    totalInputTokens += input;

    const totalCacheable = cacheRead + cacheCreation + input;
    const hitRate = totalCacheable > 0 ? (cacheRead / totalCacheable) * 100 : 0;

    return {
      id: msg.id,
      cacheRead,
      cacheCreation,
      input,
      hitRate,
    };
  });

  const totalCacheable = totalCacheReads + totalCacheCreations + totalInputTokens;
  const cacheHitRate = totalCacheable > 0 ? (totalCacheReads / totalCacheable) * 100 : 0;

  // Estimated savings: cache reads cost ~10x less than full input
  const savingsMultiplier = 0.9; // 90% savings on cached tokens
  const estimatedSavings = totalCacheReads * savingsMultiplier;

  return {
    totalCacheReads,
    totalCacheCreations,
    totalInputTokens,
    cacheHitRate,
    estimatedSavings,
    perMessageBreakdown: perMessage,
  };
}
