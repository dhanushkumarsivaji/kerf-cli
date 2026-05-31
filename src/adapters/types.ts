import type { ParsedSession } from "../types/jsonl.js";

export type ToolId = "claude-code" | "codex" | "gemini" | "opencode" | "external";

export interface AdapterSessionFile {
  /** Absolute path to the session file */
  filePath: string;
  /** Which tool produced it */
  tool: ToolId;
  /** Size in bytes — used by ingest_state for incremental sync */
  size: number;
  /** Last modified ISO timestamp */
  modified: string;
}

export interface IngestAdapter {
  /** Stable identifier, stored in the `tool` column */
  readonly id: ToolId;
  /** Human-readable name for CLI output */
  readonly displayName: string;
  /** Is this tool installed / does its data dir exist on this machine? */
  isAvailable(): boolean;
  /** Discover all session files this tool has written */
  discoverSessions(): Promise<AdapterSessionFile[]>;
  /**
   * Parse one session file into kerf's normalized shape.
   * Returns null if the file is unparseable or empty.
   */
  parseSession(file: AdapterSessionFile): ParsedSession | null;
  /**
   * Derive the project path for a session. Claude Code derives it from the
   * directory name; other tools may read it from file content or return a
   * placeholder. Receives the file and the parsed session.
   */
  resolveProjectPath(file: AdapterSessionFile, session: ParsedSession): string;
}
