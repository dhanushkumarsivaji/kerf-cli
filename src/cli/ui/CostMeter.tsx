import React from "react";
import { Box, Text } from "ink";
import { formatCost } from "../../core/costCalculator.js";

interface CostMeterProps {
  spent: number;
  windowBudget: number;
  burnRate: number;
  minutesRemaining: number;
  model: string;
}

export function CostMeter({ spent, windowBudget, burnRate, minutesRemaining, model }: CostMeterProps) {
  const pct = windowBudget > 0 ? (spent / windowBudget) * 100 : 0;
  const color = pct < 50 ? "green" : pct < 80 ? "yellow" : "red";

  const hours = Math.floor(minutesRemaining / 60);
  const mins = Math.round(minutesRemaining % 60);
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>
        <Text color={color}>{">> "}</Text>
        <Text bold>{formatCost(spent)}</Text>
        <Text dimColor> / ~{formatCost(windowBudget)} window</Text>
        <Text> | </Text>
        <Text color={color}>{formatCost(burnRate)}/min</Text>
        <Text> | </Text>
        <Text>~{timeStr} remaining</Text>
        <Text dimColor> [{model}]</Text>
      </Text>
    </Box>
  );
}
