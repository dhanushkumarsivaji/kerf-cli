import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { CostMeter } from "./CostMeter.js";
import { ContextBar } from "./ContextBar.js";
import { parseSessionFile } from "../../core/parser.js";
import {
  calculateMessageCost,
  calculateCostVelocity,
  formatCost,
  formatTokens,
} from "../../core/costCalculator.js";
import { estimateContextOverhead } from "../../core/tokenCounter.js";
import { CONTEXT_WINDOW_SIZE, BILLING_WINDOW_HOURS } from "../../core/config.js";
import type { ParsedSession } from "../../types/jsonl.js";
import type { ContextOverhead } from "../../types/config.js";

interface DashboardProps {
  sessionFilePath: string;
  interval: number;
}

export function Dashboard({ sessionFilePath, interval }: DashboardProps) {
  const { exit } = useApp();
  const [session, setSession] = useState<ParsedSession | null>(null);
  const [overhead, setOverhead] = useState<ContextOverhead>(estimateContextOverhead());
  const [showBudget, setShowBudget] = useState(false);

  useEffect(() => {
    function refresh() {
      try {
        const parsed = parseSessionFile(sessionFilePath);
        setSession(parsed);
        setOverhead(estimateContextOverhead());
      } catch {
        // File may be in the middle of a write
      }
    }

    refresh();
    const timer = setInterval(refresh, interval);
    return () => clearInterval(timer);
  }, [sessionFilePath, interval]);

  useInput(
    (input) => {
      if (input === "q") exit();
      if (input === "b") setShowBudget((prev) => !prev);
    },
    { isActive: process.stdin.isTTY ?? false },
  );

  if (!session || session.messages.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>Waiting for session data...</Text>
      </Box>
    );
  }

  const totalCost = session.messages.reduce(
    (sum, msg) => sum + calculateMessageCost(msg).totalCost,
    0,
  );
  const velocity = calculateCostVelocity(session.messages);
  const model = session.messages[session.messages.length - 1]?.model ?? "unknown";
  const windowBudget = velocity.projectedWindowCost || totalCost * 3;

  const totalInput = session.totalInputTokens + session.totalCacheReadTokens;
  const usedTokens = totalInput + session.totalOutputTokens;

  // Recent messages for the log
  const recentMessages = session.messages.slice(-8);

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          kerf-cli watch
        </Text>
        <Text> | session: {session.sessionId.slice(0, 8)}...</Text>
        <Text> | {session.messageCount} messages</Text>
        <Text dimColor> (q=quit, b=budget)</Text>
      </Box>

      <CostMeter
        spent={totalCost}
        windowBudget={windowBudget}
        burnRate={velocity.dollarsPerMinute}
        minutesRemaining={velocity.minutesRemaining}
        model={model}
      />

      <ContextBar used={usedTokens} total={CONTEXT_WINDOW_SIZE} overhead={overhead} />

      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text bold>Recent Messages:</Text>
        {recentMessages.map((msg, i) => {
          const cost = calculateMessageCost(msg);
          return (
            <Text key={i}>
              <Text dimColor>{msg.timestamp.slice(11, 19)}</Text>
              <Text> {formatTokens(msg.usage.input_tokens + msg.usage.output_tokens)} tok</Text>
              <Text color="yellow"> {formatCost(cost.totalCost)}</Text>
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
