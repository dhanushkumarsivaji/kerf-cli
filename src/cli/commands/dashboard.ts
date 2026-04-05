import { Command } from "commander";
import { startDashboardServer } from "../../web/server.js";

export function registerDashboardCommand(program: Command): void {
  program
    .command("dashboard")
    .description("Open web dashboard")
    .option("-p, --port <port>", "Port number", "3847")
    .option("--no-open", "Don't auto-open browser")
    .action(async (opts) => {
      const port = parseInt(opts.port);
      startDashboardServer(port);
      if (opts.open !== false) {
        const { exec } = await import("node:child_process");
        const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        exec(cmd + " http://localhost:" + port);
      }
    });
}
