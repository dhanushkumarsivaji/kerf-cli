import React from "react";
import { Box, Text } from "ink";
import type { ContextOverhead } from "../../types/config.js";

interface ContextBarProps {
  used: number;
  total: number;
  overhead: ContextOverhead;
}

export function ContextBar({ used, total, overhead }: ContextBarProps) {
  const barWidth = 30;
  const usedPct = total > 0 ? (used / total) * 100 : 0;
  const filledCount = Math.round((usedPct / 100) * barWidth);
  const emptyCount = barWidth - filledCount;

  const color = usedPct < 50 ? "green" : usedPct < 80 ? "yellow" : "red";

  const filled = "\u2588".repeat(filledCount);
  const empty = "\u2591".repeat(emptyCount);

  const formatK = (n: number) => `${Math.round(n / 1000)}K`;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>
        <Text>[</Text>
        <Text color={color}>{filled}</Text>
        <Text dimColor>{empty}</Text>
        <Text>]</Text>
        <Text> {usedPct.toFixed(0)}%</Text>
        <Text> | {formatK(used)} / {formatK(total)} tokens</Text>
      </Text>
      <Text dimColor>
        {"  "}system({formatK(overhead.systemPrompt)}) + tools({formatK(overhead.builtInTools)}) + mcp(
        {formatK(overhead.mcpTools)}) + claude.md({formatK(overhead.claudeMd)})
      </Text>
    </Box>
  );
}
