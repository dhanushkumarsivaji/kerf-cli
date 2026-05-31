import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAdapter, extractCodexUsage } from "../src/adapters/codex.js";
import type { AdapterSessionFile } from "../src/adapters/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures", "codex");

function fileFor(name: string): AdapterSessionFile {
  return {
    filePath: join(fixtures, name),
    tool: "codex",
    size: 1,
    modified: "2026-03-25T04:43:41.228Z",
  };
}

describe("extractCodexUsage", () => {
  it("normalizes Codex token_count last_token_usage (input excludes cached)", () => {
    const raw = {
      payload: {
        info: {
          last_token_usage: {
            input_tokens: 13119,
            cached_input_tokens: 9600,
            output_tokens: 453,
            total_tokens: 13572,
          },
        },
      },
    };
    const u = extractCodexUsage(raw);
    expect(u).toEqual({
      input_tokens: 13119 - 9600,
      output_tokens: 453,
      cache_read_input_tokens: 9600,
      cache_creation_input_tokens: 0,
    });
  });

  it("normalizes OpenAI-style usage (prompt/completion + cached_tokens)", () => {
    const raw = {
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 200,
        prompt_tokens_details: { cached_tokens: 400 },
      },
    };
    const u = extractCodexUsage(raw);
    expect(u).toEqual({
      input_tokens: 600, // 1000 - 400 cached
      output_tokens: 200,
      cache_read_input_tokens: 400,
      cache_creation_input_tokens: 0,
    });
  });

  it("returns null for events without usage", () => {
    expect(extractCodexUsage({ payload: { info: null } })).toBeNull();
    expect(extractCodexUsage({ type: "response_item", payload: {} })).toBeNull();
    expect(extractCodexUsage({})).toBeNull();
  });

  it("returns null when all token counts are zero", () => {
    expect(
      extractCodexUsage({
        payload: { info: { last_token_usage: { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 } } },
      }),
    ).toBeNull();
  });
});

describe("CodexAdapter.parseSession", () => {
  it("parses tokens, model, and dedups repeated token_count events", () => {
    const adapter = new CodexAdapter();
    const session = adapter.parseSession(fileFor("rollout-new.jsonl"));
    expect(session).not.toBeNull();

    // Two distinct token_count events with usage; the third is a verbatim
    // duplicate of the second and must be dropped.
    expect(session!.messages).toHaveLength(2);
    expect(session!.messages.every((m) => m.model === "gpt-5.4")).toBe(true);

    // Per-message sum should equal Codex's reported session total (deltas):
    //   13572 + 14214 = 27786 tokens
    const totalTokens =
      session!.totalInputTokens +
      session!.totalCacheReadTokens +
      session!.totalOutputTokens;
    expect(totalTokens).toBe(27786);

    // First message: 13119 input incl. 9600 cached → 3519 uncached input.
    expect(session!.messages[0]!.usage.input_tokens).toBe(3519);
    expect(session!.messages[0]!.usage.cache_read_input_tokens).toBe(9600);
    expect(session!.messages[0]!.usage.output_tokens).toBe(453);
  });

  it("derives the project path from the session cwd", () => {
    const adapter = new CodexAdapter();
    const path = adapter.resolveProjectPath(fileFor("rollout-new.jsonl"), {} as never);
    expect(path).toBe("/Users/dev/projects/myapp");
  });

  it("returns null for an empty/garbage session with no usage", () => {
    const adapter = new CodexAdapter();
    expect(adapter.parseSession(fileFor("rollout-empty.jsonl"))).toBeNull();
  });

  it("falls back to 'codex' when no cwd is present", () => {
    const adapter = new CodexAdapter();
    // rollout-empty has a cwd, so use a nonexistent file → read fails → "codex".
    const path = adapter.resolveProjectPath(
      { filePath: join(fixtures, "does-not-exist.jsonl"), tool: "codex", size: 1, modified: "" },
      {} as never,
    );
    expect(path).toBe("codex");
  });
});
