import React from "react";
import { Box, Text } from "ink";
import { formatCost } from "../../core/costCalculator.js";
import type { BudgetStatus } from "../../types/config.js";

interface BudgetAlertProps {
  projectName: string;
  status: BudgetStatus;
}

export function BudgetAlert({ projectName, status }: BudgetAlertProps) {
  const pct = status.percentUsed;
  const color = pct < 50 ? "green" : pct < 80 ? "yellow" : "red";
  const warning = pct >= 80;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>
        <Text>{warning ? "!! " : "   "}</Text>
        <Text bold>Project: {projectName}</Text>
        <Text> | Budget: {formatCost(status.budget)}/{status.period}</Text>
        <Text> | Spent: </Text>
        <Text color={color} bold>
          {formatCost(status.spent)} ({pct.toFixed(1)}%)
        </Text>
      </Text>
      {status.isOverBudget && (
        <Text color="red" bold>
          {"   "}OVER BUDGET by {formatCost(status.spent - status.budget)}
        </Text>
      )}
    </Box>
  );
}
