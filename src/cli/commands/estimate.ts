import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { glob } from "glob";
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
        for (const model of models) {
          const estimate = await estimateTaskCost(task, { model, files, cwd: process.cwd() });
          if (opts.json) {
            console.log(JSON.stringify(estimate, null, 2));
          } else {
            const { waitUntilExit } = render(
              React.createElement(EstimateCard, { task, estimate }),
            );
            await waitUntilExit();
          }
        }
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
