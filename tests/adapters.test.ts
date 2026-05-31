import { describe, it, expect, vi, afterEach } from "vitest";

// Mock fs so we can control CLAUDE_PROJECTS_DIR availability and stat calls.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn(actual.existsSync), statSync: vi.fn(actual.statSync) };
});

import { existsSync, statSync } from "node:fs";
import { ClaudeCodeAdapter } from "../src/adapters/claudeCode.js";
import { getAdapters, getAllAdapterIds, getAdapterById } from "../src/adapters/registry.js";
import * as parser from "../src/core/parser.js";
import type { AdapterSessionFile } from "../src/adapters/types.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClaudeCodeAdapter", () => {
  it("isAvailable() reflects whether CLAUDE_PROJECTS_DIR exists", () => {
    const adapter = new ClaudeCodeAdapter();
    vi.mocked(existsSync).mockReturnValue(true);
    expect(adapter.isAvailable()).toBe(true);
    vi.mocked(existsSync).mockReturnValue(false);
    expect(adapter.isAvailable()).toBe(false);
  });

  it("discoverSessions() returns AdapterSessionFile[] tagged claude-code", async () => {
    const adapter = new ClaudeCodeAdapter();
    vi.spyOn(parser, "findJsonlFiles").mockResolvedValue([
      "/home/u/.claude/projects/-home-u-app/sess1.jsonl",
    ]);
    vi.mocked(statSync).mockReturnValue({
      size: 123,
      mtime: new Date("2026-05-01T00:00:00Z"),
    } as unknown as ReturnType<typeof statSync>);

    const files = await adapter.discoverSessions();
    expect(files).toHaveLength(1);
    expect(files[0]!.tool).toBe("claude-code");
    expect(files[0]!.size).toBe(123);
    expect(files[0]!.modified).toBe("2026-05-01T00:00:00.000Z");
  });

  it("resolveProjectPath() decodes the parent directory name", () => {
    const adapter = new ClaudeCodeAdapter();
    const file: AdapterSessionFile = {
      filePath: "/home/u/.claude/projects/-home-u-code-app/sess.jsonl",
      tool: "claude-code",
      size: 1,
      modified: "2026-05-01T00:00:00.000Z",
    };
    // decodeProjectPath turns "-home-u-code-app" → "/home/u/code/app"
    expect(adapter.resolveProjectPath(file, {} as never)).toBe("/home/u/code/app");
  });

  it("parseSession() returns null when the underlying parse throws", () => {
    const adapter = new ClaudeCodeAdapter();
    vi.spyOn(parser, "parseSessionFile").mockImplementation(() => {
      throw new Error("bad file");
    });
    const file: AdapterSessionFile = {
      filePath: "/x.jsonl",
      tool: "claude-code",
      size: 1,
      modified: "2026-05-01T00:00:00.000Z",
    };
    expect(adapter.parseSession(file)).toBeNull();
  });
});

describe("registry", () => {
  it("getAdapters() returns only available adapters", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const ids = getAdapters().map((a) => a.id);
    expect(ids).toContain("claude-code");

    vi.mocked(existsSync).mockReturnValue(false);
    expect(getAdapters()).toHaveLength(0);
  });

  it("getAdapters(filter) returns empty when the filtered tool is unavailable", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    // Codex is not registered/available in Phase A → filtering to it yields nothing.
    expect(getAdapters(["codex"])).toHaveLength(0);
  });

  it("getAllAdapterIds() lists known adapters regardless of availability", () => {
    expect(getAllAdapterIds()).toContain("claude-code");
  });

  it("getAdapterById() finds a registered adapter", () => {
    expect(getAdapterById("claude-code")?.displayName).toBe("Claude Code");
    expect(getAdapterById("gemini")).toBeUndefined();
  });
});
