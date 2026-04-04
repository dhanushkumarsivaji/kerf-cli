import React from "react";
import { Box, Text } from "ink";
import type { CostEstimate } from "../../types/config.js";

interface EstimateCardProps {
  task: string;
  estimate: CostEstimate;
}

export function EstimateCard({ task, estimate }: EstimateCardProps) {
  const formatK = (n: number) => `${(n / 1000).toFixed(1)}K`;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyan">
        kerf estimate: '{task}'
      </Text>
      <Text> </Text>
      <Text>
        Model: <Text bold>{estimate.model}</Text>
      </Text>
      <Text>
        Estimated turns: {estimate.estimatedTurns.low}-{estimate.estimatedTurns.high} (expected:{" "}
        {estimate.estimatedTurns.expected})
      </Text>
      <Text>
        Files: {formatK(estimate.fileTokens)} tokens
      </Text>
      <Text>
        Context overhead: {formatK(estimate.contextOverhead)} tokens (ghost tokens)
      </Text>
      <Text> </Text>
      <Text bold>Estimated Cost:</Text>
      <Text>
        {"  "}Low:      <Text color="green">{estimate.estimatedCost.low}</Text>
      </Text>
      <Text>
        {"  "}Expected: <Text color="yellow">{estimate.estimatedCost.expected}</Text>
      </Text>
      <Text>
        {"  "}High:     <Text color="red">{estimate.estimatedCost.high}</Text>
      </Text>
      <Text> </Text>
      <Text>Window Usage: ~{estimate.percentOfWindow}% of 5-hour window</Text>
      {estimate.recommendations.map((rec, i) => (
        <Text key={i} color="cyan">
          {"  -> "}{rec}
        </Text>
      ))}
    </Box>
  );
}
