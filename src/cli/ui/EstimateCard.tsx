import React from "react";
import { Box, Text } from "ink";
import type { CostEstimate } from "../../types/config.js";

interface EstimateCardProps {
  task: string;
  estimate: CostEstimate;
}

export function EstimateCard({ task, estimate }: EstimateCardProps) {
  const formatK = (n: number) => `${(n / 1000).toFixed(1)}K`;
  const s = estimate.complexitySignals;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyan">
        kerf-cli estimate: '{task}'
      </Text>
      <Text> </Text>
      <Text>
        Model: <Text bold>{estimate.model}</Text>
      </Text>
      <Text>
        Complexity: <Text bold>{estimate.detectedComplexity}</Text>
        <Text dimColor> (score: {s.totalScore.toFixed(2)})</Text>
      </Text>
      <Text dimColor>
        {"  "}keywords:{s.keywordScore.toFixed(1)} files:{s.fileSizeScore.toFixed(1)} count:{s.fileCountScore.toFixed(1)} desc:{s.descriptionLengthScore.toFixed(1)}
      </Text>
      <Text>
        Estimated turns: {estimate.estimatedTurns.low}-{estimate.estimatedTurns.high} (expected:{" "}
        {estimate.estimatedTurns.expected})
      </Text>
      <Text>
        Files: {estimate.fileCount} file(s), {formatK(estimate.fileTokens)} tokens
      </Text>
      <Text>
        Context overhead: {formatK(estimate.contextOverhead)} tokens (ghost tokens)
      </Text>
      <Text>
        Tool overhead: ~{formatK(estimate.estimatedToolOverhead)} tokens ({Math.round(estimate.estimatedToolOverhead / estimate.estimatedTurns.expected / 800)} calls/turn)
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
      <Text>
        Token counting:{" "}
        {estimate.tokenCountingMethod === "precise"
          ? "precise (via Anthropic API)"
          : "heuristic (set ANTHROPIC_API_KEY for precise counts)"}
      </Text>
      <Text>Window Usage: ~{estimate.percentOfWindow}% of 5-hour window</Text>
      {estimate.recommendations.map((rec, i) => (
        <Text key={i} color="cyan">
          {"  -> "}{rec}
        </Text>
      ))}
    </Box>
  );
}
