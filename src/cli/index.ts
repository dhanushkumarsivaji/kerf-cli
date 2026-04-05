import { createRequire } from "node:module";
import { Command } from "commander";
import { registerWatchCommand } from "./commands/watch.js";
import { registerEstimateCommand } from "./commands/estimate.js";
import { registerBudgetCommand } from "./commands/budget.js";
import { registerAuditCommand } from "./commands/audit.js";
import { registerReportCommand } from "./commands/report.js";
import { registerInitCommand } from "./commands/init.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json");

const program = new Command();

program
  .name("kerf-cli")
  .version(pkg.version)
  .description("Cost intelligence for Claude Code. Know before you spend.");

// Register all subcommands
registerWatchCommand(program);
registerEstimateCommand(program);
registerBudgetCommand(program);
registerAuditCommand(program);
registerReportCommand(program);
registerInitCommand(program);

// Default to watch if no command given
program.action(async () => {
  await program.commands.find((c) => c.name() === "watch")?.parseAsync([], { from: "user" });
});

program.parse();
