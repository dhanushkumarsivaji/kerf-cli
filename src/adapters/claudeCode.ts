import { existsSync, statSync } from "node:fs";
import { dirname, basename } from "node:path";
import { findJsonlFiles, parseSessionFile, decodeProjectPath } from "../core/parser.js";
import { CLAUDE_PROJECTS_DIR } from "../core/config.js";
import type { IngestAdapter, AdapterSessionFile } from "./types.js";
import type { ParsedSession } from "../types/jsonl.js";

export class ClaudeCodeAdapter implements IngestAdapter {
  readonly id = "claude-code" as const;
  readonly displayName = "Claude Code";

  isAvailable(): boolean {
    return existsSync(CLAUDE_PROJECTS_DIR);
  }

  async discoverSessions(): Promise<AdapterSessionFile[]> {
    const files = await findJsonlFiles();
    const out: AdapterSessionFile[] = [];
    for (const filePath of files) {
      try {
        const stat = statSync(filePath);
        out.push({
          filePath,
          tool: this.id,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      } catch {
        // file vanished between listing and stat — skip
      }
    }
    return out;
  }

  parseSession(file: AdapterSessionFile): ParsedSession | null {
    try {
      return parseSessionFile(file.filePath);
    } catch {
      return null;
    }
  }

  resolveProjectPath(file: AdapterSessionFile): string {
    const parentDir = basename(dirname(file.filePath));
    return decodeProjectPath(parentDir);
  }
}
