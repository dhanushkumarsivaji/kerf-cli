import { Command } from "commander";
import { startMcpServer } from "../../mcp/server.js";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description(
      "Start the kerf MCP server (stdio) — query your AI coding costs from inside Claude Code, Cursor, or any MCP client",
    )
    .action(async () => {
      // The MCP protocol speaks JSON-RPC over stdout, so nothing else may be
      // written there. Run the server and keep the process alive on the transport.
      try {
        await startMcpServer();
      } catch (err) {
        // Errors must go to stderr to avoid corrupting the stdio protocol stream.
        process.stderr.write(`kerf mcp failed to start: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}
