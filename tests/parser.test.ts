import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonlContent, parseJsonlLine, parseSessionFile, encodeProjectPath, decodeProjectPath, findJsonlFilesForProject } from "../src/core/parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "fixtures", "sample-session.jsonl");

describe("parseJsonlLine", () => {
  it("parses a valid JSON line", () => {
    const line = '{"type":"message","message":{"id":"msg_1","model":"claude-sonnet-4-20250514","usage":{"input_tokens":1000}}}';
    const result = parseJsonlLine(line);
    expect(result).not.toBeNull();
    expect(result?.message?.id).toBe("msg_1");
  });

  it("returns null for empty lines", () => {
    expect(parseJsonlLine("")).toBeNull();
    expect(parseJsonlLine("   ")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseJsonlLine("{invalid json")).toBeNull();
  });
});

describe("parseJsonlContent", () => {
  it("deduplicates messages by id, keeping the last occurrence", () => {
    const content = [
      '{"type":"message","message":{"id":"msg_1","model":"claude-sonnet-4-20250514","usage":{"input_tokens":1000,"output_tokens":1}}}',
      '{"type":"message","message":{"id":"msg_1","model":"claude-sonnet-4-20250514","usage":{"input_tokens":1000,"output_tokens":500}}}',
    ].join("\n");

    const messages = parseJsonlContent(content, "test-session");
    expect(messages).toHaveLength(1);
    expect(messages[0].usage.output_tokens).toBe(500);
  });

  it("parses all token types", () => {
    const content = '{"type":"message","message":{"id":"msg_1","model":"claude-sonnet-4-20250514","usage":{"input_tokens":1000,"output_tokens":500,"cache_read_input_tokens":800,"cache_creation_input_tokens":200}},"timestamp":"2026-04-04T10:00:00Z"}';
    const messages = parseJsonlContent(content, "test");
    expect(messages[0].usage.cache_read_input_tokens).toBe(800);
    expect(messages[0].usage.cache_creation_input_tokens).toBe(200);
  });

  it("handles total_cost_usd", () => {
    const content = '{"type":"message","message":{"id":"msg_1","model":"claude-sonnet-4-20250514","usage":{"input_tokens":1000,"output_tokens":500}},"total_cost_usd":0.05}';
    const messages = parseJsonlContent(content, "test");
    expect(messages[0].totalCostUsd).toBe(0.05);
  });

  it("merges duplicate message IDs by taking max per field, not last value", () => {
    const content = [
      '{"type":"message","message":{"id":"msg_1","model":"claude-sonnet-4-20250514","usage":{"input_tokens":1234,"output_tokens":0,"cache_read_input_tokens":5000}}}',
      '{"type":"message","message":{"id":"msg_1","model":"claude-sonnet-4-20250514","usage":{"input_tokens":0,"output_tokens":567,"cache_read_input_tokens":5000}}}',
    ].join("\n");
    const messages = parseJsonlContent(content, "test-session");
    expect(messages).toHaveLength(1);
    expect(messages[0].usage.input_tokens).toBe(1234);
    expect(messages[0].usage.output_tokens).toBe(567);
    expect(messages[0].usage.cache_read_input_tokens).toBe(5000);
  });

  it("handles streaming intermediate values (output_tokens: 1)", () => {
    const content = [
      '{"type":"message","message":{"id":"msg_1","model":"claude-sonnet-4-20250514","usage":{"input_tokens":5000,"output_tokens":1}}}',
      '{"type":"message","message":{"id":"msg_1","model":"claude-sonnet-4-20250514","usage":{"input_tokens":5000,"output_tokens":1200,"cache_read_input_tokens":4000}}}',
    ].join("\n");

    const messages = parseJsonlContent(content, "test");
    expect(messages).toHaveLength(1);
    expect(messages[0].usage.output_tokens).toBe(1200);
  });
});

describe("parseSessionFile", () => {
  it("parses the fixture file correctly", () => {
    const session = parseSessionFile(FIXTURE_PATH);
    expect(session.sessionId).toBe("sample-session");
    expect(session.messageCount).toBe(20);
    expect(session.totalInputTokens).toBeGreaterThan(0);
    expect(session.totalOutputTokens).toBeGreaterThan(0);
  });

  it("has correct start and end times", () => {
    const session = parseSessionFile(FIXTURE_PATH);
    expect(session.startTime).toBe("2026-04-04T10:00:05Z");
    expect(session.endTime).toContain("2026-04-04T10:58:00Z");
  });

  it("includes cache token totals", () => {
    const session = parseSessionFile(FIXTURE_PATH);
    expect(session.totalCacheReadTokens).toBeGreaterThan(0);
    expect(session.totalCacheCreationTokens).toBeGreaterThan(0);
  });
});

describe("project path encoding", () => {
  it("encodes absolute paths by replacing / with -", () => {
    expect(encodeProjectPath("/home/user/foo")).toBe("-home-user-foo");
  });

  it("encodes root as a single dash", () => {
    expect(encodeProjectPath("/")).toBe("-");
  });

  it("decode reverses encode", () => {
    expect(decodeProjectPath(encodeProjectPath("/home/user/foo"))).toBe("/home/user/foo");
  });

  it("findJsonlFilesForProject returns [] for nonexistent project", () => {
    expect(findJsonlFilesForProject("/zzz-no-such-project-aaa")).toEqual([]);
  });
});
