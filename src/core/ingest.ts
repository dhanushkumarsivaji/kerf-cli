import type Database from "better-sqlite3";
import { calculateMessageCost } from "./costCalculator.js";
import { getAdapters } from "../adapters/registry.js";
import type { IngestAdapter, AdapterSessionFile, ToolId } from "../adapters/types.js";

export interface IngestStats {
  filesProcessed: number;
  newMessages: number;
  durationMs: number;
}

export interface FileIngestResult {
  newMessages: number;
  skipped: boolean;
}

/**
 * IngestService — drives a set of adapters (Claude Code, Codex, …) to parse
 * their session files and writes them into the kerf SQLite analytics tables.
 * Tracks file size + mtime so it only processes files that changed since the
 * last sync. Adapters produce the normalized ParsedSession shape; this service
 * is tool-agnostic and stamps each row with the adapter's tool id.
 */
export class IngestService {
  private insertMessage: Database.Statement;
  private upsertSessionMeta: Database.Statement;
  private upsertIngestState: Database.Statement;
  private getIngestState: Database.Statement;
  private getSessionAggregate: Database.Statement;
  private deleteSummariesSince: Database.Statement;
  private insertDailySummary: Database.Statement;

  constructor(private db: Database.Database) {
    this.insertMessage = db.prepare(`
      INSERT OR IGNORE INTO messages (
        message_id, session_id, project_path, model, timestamp,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
        cost_usd, source_file, tool
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.upsertSessionMeta = db.prepare(`
      INSERT INTO sessions_meta (
        session_id, project_path, first_message_at, last_message_at,
        message_count, total_input_tokens, total_output_tokens,
        total_cache_read, total_cache_creation, total_cost_usd, models, tool, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET
        project_path = excluded.project_path,
        first_message_at = excluded.first_message_at,
        last_message_at = excluded.last_message_at,
        message_count = excluded.message_count,
        total_input_tokens = excluded.total_input_tokens,
        total_output_tokens = excluded.total_output_tokens,
        total_cache_read = excluded.total_cache_read,
        total_cache_creation = excluded.total_cache_creation,
        total_cost_usd = excluded.total_cost_usd,
        models = excluded.models,
        tool = excluded.tool,
        last_synced_at = datetime('now')
    `);

    this.upsertIngestState = db.prepare(`
      INSERT INTO ingest_state (source_file, last_size, last_modified, message_count, last_ingested_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(source_file) DO UPDATE SET
        last_size = excluded.last_size,
        last_modified = excluded.last_modified,
        message_count = excluded.message_count,
        last_ingested_at = datetime('now')
    `);

    this.getIngestState = db.prepare(
      `SELECT last_size, last_modified FROM ingest_state WHERE source_file = ?`,
    );

    this.getSessionAggregate = db.prepare(`
      SELECT
        MIN(timestamp) as first_message_at,
        MAX(timestamp) as last_message_at,
        COUNT(*) as message_count,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cache_read_tokens) as total_cache_read,
        SUM(cache_creation_tokens) as total_cache_creation,
        SUM(cost_usd) as total_cost_usd,
        json_group_array(DISTINCT model) as models,
        project_path,
        tool
      FROM messages
      WHERE session_id = ?
      GROUP BY session_id
    `);

    this.deleteSummariesSince = db.prepare(`DELETE FROM daily_summaries WHERE date >= ?`);

    this.insertDailySummary = db.prepare(`
      INSERT INTO daily_summaries (
        date, total_cost_usd, total_input_tokens, total_output_tokens,
        total_cache_read, total_cache_creation, message_count, session_count,
        model_breakdown, project_breakdown, tool_breakdown
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  /**
   * Ingest a single session file via its adapter. Idempotent — if size+mtime
   * are unchanged since the last ingest, returns immediately.
   */
  ingestFile(file: AdapterSessionFile, adapter: IngestAdapter): FileIngestResult {
    const { filePath } = file;
    const lastModified = file.modified;
    const existing = this.getIngestState.get(filePath) as
      | { last_size: number; last_modified: string }
      | undefined;

    if (existing && existing.last_size === file.size && existing.last_modified === lastModified) {
      return { newMessages: 0, skipped: true };
    }

    const session = adapter.parseSession(file);
    if (!session) {
      return { newMessages: 0, skipped: true };
    }

    if (session.messages.length === 0) {
      this.upsertIngestState.run(filePath, file.size, lastModified, 0);
      return { newMessages: 0, skipped: false };
    }

    const projectPath = adapter.resolveProjectPath(file, session);

    const insertAll = this.db.transaction(() => {
      let inserted = 0;
      for (const msg of session.messages) {
        const cost = msg.totalCostUsd ?? calculateMessageCost(msg).totalCost;
        const result = this.insertMessage.run(
          msg.id,
          session.sessionId,
          projectPath,
          msg.model,
          msg.timestamp,
          msg.usage.input_tokens,
          msg.usage.output_tokens,
          msg.usage.cache_read_input_tokens,
          msg.usage.cache_creation_input_tokens,
          cost,
          filePath,
          adapter.id,
        );
        if (result.changes > 0) inserted++;
      }
      return inserted;
    });

    const newMessages = insertAll();

    const agg = this.getSessionAggregate.get(session.sessionId) as
      | {
          first_message_at: string;
          last_message_at: string;
          message_count: number;
          total_input_tokens: number;
          total_output_tokens: number;
          total_cache_read: number;
          total_cache_creation: number;
          total_cost_usd: number;
          models: string;
          project_path: string;
          tool: string;
        }
      | undefined;

    if (agg) {
      this.upsertSessionMeta.run(
        session.sessionId,
        agg.project_path,
        agg.first_message_at,
        agg.last_message_at,
        agg.message_count,
        agg.total_input_tokens,
        agg.total_output_tokens,
        agg.total_cache_read,
        agg.total_cache_creation,
        agg.total_cost_usd,
        agg.models,
        agg.tool,
      );
    }

    this.upsertIngestState.run(filePath, file.size, lastModified, session.messages.length);
    return { newMessages, skipped: false };
  }

  /**
   * Ingest all session files across every available adapter, optionally
   * filtered to a specific set of tools.
   */
  async ingestAll(toolFilter?: ToolId[]): Promise<IngestStats> {
    const start = Date.now();
    const adapters = getAdapters(toolFilter);

    let totalNew = 0;
    let processed = 0;

    for (const adapter of adapters) {
      const files = await adapter.discoverSessions();
      for (const file of files) {
        const result = this.ingestFile(file, adapter);
        if (!result.skipped) processed++;
        totalNew += result.newMessages;
      }
    }

    // Recompute daily summaries for the last 7 days
    this.recomputeDailySummaries();

    return {
      filesProcessed: processed,
      newMessages: totalNew,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Per-adapter ingest that also returns counts, for CLI output that reports
   * results tool-by-tool. Skips daily-summary recompute (caller does it once).
   */
  ingestAdapterFiles(adapter: IngestAdapter, files: AdapterSessionFile[]): IngestStats {
    const start = Date.now();
    let totalNew = 0;
    let processed = 0;
    for (const file of files) {
      const result = this.ingestFile(file, adapter);
      if (!result.skipped) processed++;
      totalNew += result.newMessages;
    }
    return { filesProcessed: processed, newMessages: totalNew, durationMs: Date.now() - start };
  }

  /**
   * Recompute daily aggregate rows from messages, since the given date (default: 7 days ago).
   */
  recomputeDailySummaries(sinceDate?: string): number {
    const since = sinceDate ?? this.daysAgo(7);
    this.deleteSummariesSince.run(since);

    const rows = this.db
      .prepare(
        `SELECT
          date(timestamp) as date,
          SUM(cost_usd) as total_cost_usd,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(cache_read_tokens) as total_cache_read,
          SUM(cache_creation_tokens) as total_cache_creation,
          COUNT(*) as message_count,
          COUNT(DISTINCT session_id) as session_count
        FROM messages
        WHERE date(timestamp) >= ?
        GROUP BY date(timestamp)`,
      )
      .all(since) as Array<{
        date: string;
        total_cost_usd: number;
        total_input_tokens: number;
        total_output_tokens: number;
        total_cache_read: number;
        total_cache_creation: number;
        message_count: number;
        session_count: number;
      }>;

    for (const row of rows) {
      // Per-day model, project, and tool breakdowns
      const models = this.db
        .prepare(
          `SELECT model, SUM(cost_usd) as cost FROM messages WHERE date(timestamp) = ? GROUP BY model`,
        )
        .all(row.date) as Array<{ model: string; cost: number }>;
      const projects = this.db
        .prepare(
          `SELECT project_path, SUM(cost_usd) as cost FROM messages WHERE date(timestamp) = ? GROUP BY project_path`,
        )
        .all(row.date) as Array<{ project_path: string; cost: number }>;
      const tools = this.db
        .prepare(
          `SELECT tool, SUM(cost_usd) as cost FROM messages WHERE date(timestamp) = ? GROUP BY tool`,
        )
        .all(row.date) as Array<{ tool: string; cost: number }>;

      const modelBreakdown = Object.fromEntries(models.map((m) => [m.model, m.cost]));
      const projectBreakdown = Object.fromEntries(projects.map((p) => [p.project_path, p.cost]));
      const toolBreakdown = Object.fromEntries(tools.map((t) => [t.tool, t.cost]));

      this.insertDailySummary.run(
        row.date,
        row.total_cost_usd,
        row.total_input_tokens,
        row.total_output_tokens,
        row.total_cache_read,
        row.total_cache_creation,
        row.message_count,
        row.session_count,
        JSON.stringify(modelBreakdown),
        JSON.stringify(projectBreakdown),
        JSON.stringify(toolBreakdown),
      );
    }

    return rows.length;
  }

  private daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }
}
