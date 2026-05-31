import { describe, it, expect } from "vitest";
import { parseOtelLogContent } from "../src/adapters/otel.js";

describe("parseOtelLogContent", () => {
  it("parses JSONL records with a plain attribute map and groups by conversation id", () => {
    const content = [
      JSON.stringify({
        timestamp: "2026-05-29T10:00:00Z",
        attributes: {
          "gen_ai.conversation.id": "conv-1",
          "gen_ai.request.model": "gemini-2.5-pro",
          "gen_ai.usage.input_tokens": 1000,
          "gen_ai.usage.output_tokens": 200,
          "gen_ai.usage.cached_input_tokens": 400,
        },
      }),
      JSON.stringify({
        timestamp: "2026-05-29T10:01:00Z",
        attributes: {
          "gen_ai.conversation.id": "conv-1",
          "gen_ai.request.model": "gemini-2.5-pro",
          "gen_ai.usage.input_tokens": 500,
          "gen_ai.usage.output_tokens": 100,
        },
      }),
    ].join("\n");

    const sessions = parseOtelLogContent(content, "gemini", "/logs/telemetry.log");
    expect(sessions).toHaveLength(1);
    const s = sessions[0]!;
    expect(s.tool).toBe("gemini");
    expect(s.session.sessionId).toBe("conv-1");
    expect(s.session.messageCount).toBe(2);
    // First record: 1000 input incl. 400 cached → 600 uncached input + 400 cache_read.
    expect(s.session.messages[0]!.usage.input_tokens).toBe(600);
    expect(s.session.messages[0]!.usage.cache_read_input_tokens).toBe(400);
    expect(s.session.totalOutputTokens).toBe(300);
  });

  it("parses the OTLP/JSON array attribute form inside a resourceLogs batch", () => {
    const batch = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: "1780000000000000000",
                  attributes: [
                    { key: "gen_ai.system", value: { stringValue: "opencode" } },
                    { key: "gen_ai.response.model", value: { stringValue: "gemini-2.5-flash" } },
                    { key: "gen_ai.usage.input_tokens", value: { intValue: "800" } },
                    { key: "gen_ai.usage.output_tokens", value: { intValue: "120" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const sessions = parseOtelLogContent(JSON.stringify(batch), "fallback", "/logs/otlp.json");
    expect(sessions).toHaveLength(1);
    // tool comes from gen_ai.system, overriding the source default.
    expect(sessions[0]!.tool).toBe("opencode");
    expect(sessions[0]!.session.messages[0]!.model).toBe("gemini-2.5-flash");
    expect(sessions[0]!.session.totalInputTokens).toBe(800);
  });

  it("falls back to one session per file when no conversation id is present", () => {
    const content = JSON.stringify({
      attributes: {
        "gen_ai.request.model": "gemini-2.5-pro",
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.output_tokens": 50,
      },
    });
    const sessions = parseOtelLogContent(content, "gemini", "/logs/my-telemetry.log");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.session.sessionId).toBe("gemini-my-telemetry");
  });

  it("ignores records without usage and returns [] for empty content", () => {
    expect(parseOtelLogContent("", "gemini", "/logs/x.log")).toEqual([]);
    const noUsage = JSON.stringify({ attributes: { "gen_ai.request.model": "x" } });
    expect(parseOtelLogContent(noUsage, "gemini", "/logs/x.log")).toEqual([]);
  });
});
