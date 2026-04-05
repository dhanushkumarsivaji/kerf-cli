import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { glob } from "glob";
import chalk from "chalk";
import { estimateTaskCost } from "../../core/estimator.js";
import { EstimateCard } from "../ui/EstimateCard.js";

export function registerEstimateCommand(program: Command): void {
  program
    .command("estimate <task>")
    .description("Pre-flight cost estimation")
    .option("-m, --model <model>", "Model to estimate for", "sonnet")
    .option("-f, --files <glob>", "Specific files that will be touched")
    .option("--compare", "Show Sonnet vs Opus vs Haiku comparison")
    .option("--json", "Output as JSON")
    .action(async (task: string, opts) => {
      const files: string[] = [];
      if (opts.files) {
        const matched = await glob(opts.files, { absolute: true });
        files.push(...matched);
      }

      if (opts.compare) {
        const models = ["sonnet", "opus", "haiku"] as const;

        if (opts.json) {
          for (const model of models) {
            const estimate = await estimateTaskCost(task, { model, files, cwd: process.cwd() });
            console.log(JSON.stringify(estimate, null, 2));
          }
          return;
        }

        // Print comparison table
        const estimates = await Promise.all(
          models.map(async (model) => ({
            model,
            estimate: await estimateTaskCost(task, { model, files, cwd: process.cwd() }),
          })),
        );

        console.log(chalk.bold.cyan(`\n  kerf-cli estimate: '${task}'\n`));
        console.log(
          `  ${"Model".padEnd(10)} ${"Turns".padEnd(14)} ${"Low".padEnd(12)} ${"Expected".padEnd(12)} ${"High".padEnd(12)}`,
        );
        console.log("  " + "-".repeat(58));
        for (const { model, estimate } of estimates) {
          const turns = `${estimate.estimatedTurns.low}-${estimate.estimatedTurns.high}`;
          console.log(
            `  ${model.padEnd(10)} ${turns.padEnd(14)} ${chalk.green(estimate.estimatedCost.low.padEnd(12))} ${chalk.yellow(estimate.estimatedCost.expected.padEnd(12))} ${chalk.red(estimate.estimatedCost.high.padEnd(12))}`,
          );
        }
        console.log();

        const cheapest = estimates[2]; // haiku
        const priciest = estimates[1]; // opus
        console.log(
          chalk.dim(`  Cheapest: ${cheapest.model} at ${cheapest.estimate.estimatedCost.expected}`),
        );
        console.log(
          chalk.dim(`  Priciest: ${priciest.model} at ${priciest.estimate.estimatedCost.expected}`),
        );
        console.log();
        return;
      }

      const estimate = await estimateTaskCost(task, {
        model: opts.model,
        files,
        cwd: process.cwd(),
      });

      if (opts.json) {
        console.log(JSON.stringify(estimate, null, 2));
        return;
      }

      const { waitUntilExit } = render(
        React.createElement(EstimateCard, { task, estimate }),
      );
      await waitUntilExit();
    });
}
