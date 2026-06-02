import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type Database from "better-sqlite3";
import { initDatabase } from "../db/schema.js";
import { runMigrations } from "../db/migrations.js";
import { IngestService } from "../core/ingest.js";
import { MCP_TOOLS, runTool } from "./tools.js";

declare const __KERF_VERSION__: string;

/**
 * Build the kerf MCP server. Exposes a small, SAFE, READ-ONLY toolset over
 * kerf's local analytics DB. Binds to stdio only — never opens a network port,
 * never writes to the database (kerf_query reuses the CLI's read-only guard).
 */
export function createMcpServer(db: Database.Database): Server {
  const version = typeof __KERF_VERSION__ !== "undefined" ? __KERF_VERSION__ : "0.0.0";
  const server = new Server(
    { name: "kerf", version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: MCP_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = runTool(db, name, (args ?? {}) as Record<string, unknown>);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });

  return server;
}

/** Start the kerf MCP server over stdio. Syncs once up front so data is fresh. */
export async function startMcpServer(): Promise<void> {
  const db = initDatabase();
  runMigrations(db);

  // Best-effort initial sync so the assistant sees current data.
  try {
    await new IngestService(db).ingestAll();
  } catch {
    // non-fatal — serve whatever is already in the DB
  }

  const server = createMcpServer(db);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
