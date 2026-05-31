import { ClaudeCodeAdapter } from "./claudeCode.js";
import type { IngestAdapter, ToolId } from "./types.js";

/** All known adapters. Add new tools here. */
const ALL_ADAPTERS: IngestAdapter[] = [
  new ClaudeCodeAdapter(),
  // CodexAdapter added in Phase B
  // OtelAdapter / ExternalAdapter added in Phase C
];

/**
 * Return adapters whose tool is installed on this machine,
 * optionally filtered to a specific set of tool IDs.
 */
export function getAdapters(filter?: ToolId[]): IngestAdapter[] {
  const available = ALL_ADAPTERS.filter((a) => a.isAvailable());
  if (!filter || filter.length === 0) return available;
  return available.filter((a) => filter.includes(a.id));
}

/** All adapter IDs regardless of availability (for --tool validation). */
export function getAllAdapterIds(): ToolId[] {
  return ALL_ADAPTERS.map((a) => a.id);
}

/** Look up a single adapter by ID. */
export function getAdapterById(id: ToolId): IngestAdapter | undefined {
  return ALL_ADAPTERS.find((a) => a.id === id);
}
