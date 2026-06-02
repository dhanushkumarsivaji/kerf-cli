/**
 * Read-only SQL guard, shared by the CLI `query` command and the MCP server's
 * `kerf_query` tool. There is ONE definition so both paths reject writes
 * identically — the MCP server must never be able to mutate kerf.db.
 */

/** Statements that mutate data or schema, or could exfiltrate/attach files. */
export const FORBIDDEN_SQL =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|PRAGMA|REPLACE|TRUNCATE)\b/i;

export interface SqlGuardResult {
  ok: boolean;
  /** The forbidden keyword that caused rejection (upper-cased), if any. */
  rejected?: string;
}

/**
 * Check whether a SQL string is a safe, read-only query.
 * Returns { ok: false, rejected } if it contains a forbidden statement.
 */
export function checkReadOnlySql(sql: string): SqlGuardResult {
  const match = sql.match(FORBIDDEN_SQL);
  if (match) {
    return { ok: false, rejected: match[1]!.toUpperCase() };
  }
  return { ok: true };
}
