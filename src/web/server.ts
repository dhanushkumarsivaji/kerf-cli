import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { initDatabase } from "../db/schema.js";
import { runMigrations } from "../db/migrations.js";
import { IngestService } from "../core/ingest.js";
import { handleApiRequest } from "./routes/api.js";
import { handleStaticRequest } from "./routes/static.js";

export function startDashboardServer(port: number): void {
  const db = initDatabase();
  runMigrations(db);

  // Background ingest on startup — don't block server start
  const ingest = new IngestService(db);
  ingest
    .ingestAll()
    .then((stats) => {
      // eslint-disable-next-line no-console
      console.log(
        `[kerf] Initial sync: ${stats.filesProcessed} files, ${stats.newMessages} messages in ${stats.durationMs}ms`,
      );
    })
    .catch((err) => {
      console.error("[kerf] Initial sync failed:", err);
    });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    const start = Date.now();

    try {
      if (url.startsWith("/api/")) {
        await handleApiRequest(req, res, db, ingest);
      } else {
        handleStaticRequest(req, res);
      }

      const duration = Date.now() - start;
      if (duration > 100 && url.startsWith("/api/")) {
        // eslint-disable-next-line no-console
        console.warn(`[kerf] slow request: ${url} took ${duration}ms`);
      }
    } catch (err) {
      console.error("[kerf] Dashboard error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`kerf dashboard running at http://localhost:${port}`);
  });

  process.on("SIGINT", () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
