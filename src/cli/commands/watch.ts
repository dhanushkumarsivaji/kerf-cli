import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { getActiveSessions } from "../../core/parser.js";
import { Dashboard } from "../ui/Dashboard.js";

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Real-time cost dashboard (default)")
    .option("-s, --session <id>", "Watch a specific session")
    .option("-p, --project <path>", "Watch sessions for a specific project")
    .option("-i, --interval <ms>", "Polling interval in ms", "2000")
    .option("--no-color", "Disable colors")
    .action(async (opts) => {
      const interval = parseInt(opts.interval, 10);

      let sessionFilePath: string | undefined;

      if (opts.session) {
        const sessions = await getActiveSessions(opts.project);
        const found = sessions.find((s) => s.sessionId.startsWith(opts.session));
        sessionFilePath = found?.filePath;
      } else {
        const sessions = await getActiveSessions(opts.project);
        sessionFilePath = sessions[0]?.filePath;
      }

      if (!sessionFilePath) {
        console.log(
          "No active Claude Code session found. Start Claude Code and run 'kerf watch' again.",
        );
        process.exit(0);
      }

      const { waitUntilExit } = render(
        React.createElement(Dashboard, { sessionFilePath, interval }),
      );
      await waitUntilExit();
    });
}
