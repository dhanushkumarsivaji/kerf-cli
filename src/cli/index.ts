import { Command } from "commander";
import { registerWatchCommand } from "./commands/watch.js";
import { registerEstimateCommand } from "./commands/estimate.js";
import { registerBudgetCommand } from "./commands/budget.js";
import { registerAuditCommand } from "./commands/audit.js";
import { registerReportCommand } from "./commands/report.js";
import { registerInitCommand } from "./commands/init.js";
import { registerImportCommand } from "./commands/import.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerSummaryCommand } from "./commands/summary.js";
import { registerSessionsCommand } from "./commands/sessions.js";
import { registerQueryCommand } from "./commands/query.js";
import { registerEfficiencyCommand } from "./commands/efficiency.js";
import { registerCacheCommand } from "./commands/cache.js";
import { registerDoctorCommand } from "./commands/doctor.js";

declare const __KERF_VERSION__: string;

const program = new Command();

program
  .name("kerf-cli")
  .version(__KERF_VERSION__)
  .description("Cost intelligence for Claude Code. Know before you spend.");

// Register all subcommands
registerWatchCommand(program);
registerEstimateCommand(program);
registerBudgetCommand(program);
registerAuditCommand(program);
registerReportCommand(program);
registerInitCommand(program);
registerImportCommand(program);
registerSyncCommand(program);
registerSummaryCommand(program);
registerSessionsCommand(program);
registerQueryCommand(program);
registerEfficiencyCommand(program);
registerCacheCommand(program);
registerDoctorCommand(program);

// Default to watch if no command given
program.action(async () => {
  await program.commands.find((c) => c.name() === "watch")?.parseAsync([], { from: "user" });
});

program.parse();
