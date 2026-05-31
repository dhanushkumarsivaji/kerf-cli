import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TokenAnomaly } from "../src/core/anomalyDetector.js";

// Mock child_process so desktopNotify never actually shells out.
const execMock = vi.fn();
vi.mock("node:child_process", () => ({
  exec: (...args: unknown[]) => execMock(...args),
}));

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AlertDispatcher,
  desktopNotify,
  webhookNotify,
  DEFAULT_ALERT_CONFIG,
  type AlertConfig,
} from "../src/core/alerts.js";
import { loadAlertConfig, saveConfigFile } from "../src/core/config.js";

function makeAnomaly(overrides: Partial<TokenAnomaly> = {}): TokenAnomaly {
  return {
    type: "cost_spike",
    severity: "critical",
    turnNumber: 5,
    messageId: "msg_05",
    description: "Turn cost $1.20 is 6.0x the session average of $0.20",
    metric: 6,
    expectedRange: "< $0.60",
    recommendation: "Investigate this turn for unnecessary tool calls",
    ...overrides,
  };
}

describe("AlertDispatcher", () => {
  beforeEach(() => {
    execMock.mockClear();
  });

  it("critical-only config drops warning anomalies", async () => {
    const config: AlertConfig = {
      channels: ["desktop"],
      minSeverity: "critical",
      debounceSeconds: 0,
    };
    const dispatcher = new AlertDispatcher(config);

    await dispatcher.dispatch(makeAnomaly({ severity: "warning", type: "input_explosion" }));
    expect(execMock).not.toHaveBeenCalled();

    await dispatcher.dispatch(makeAnomaly({ severity: "critical" }));
    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it("warning-severity config allows warnings through", async () => {
    const config: AlertConfig = {
      channels: ["desktop"],
      minSeverity: "warning",
      debounceSeconds: 0,
    };
    const dispatcher = new AlertDispatcher(config);
    await dispatcher.dispatch(makeAnomaly({ severity: "warning", type: "input_explosion" }));
    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it("debounces the same anomaly type within the debounce window", async () => {
    const config: AlertConfig = {
      channels: ["desktop"],
      minSeverity: "critical",
      debounceSeconds: 120,
    };
    const dispatcher = new AlertDispatcher(config);

    await dispatcher.dispatch(makeAnomaly({ type: "cost_spike" }));
    await dispatcher.dispatch(makeAnomaly({ type: "cost_spike" }));
    expect(execMock).toHaveBeenCalledTimes(1);

    // A different type is not debounced together with cost_spike.
    await dispatcher.dispatch(makeAnomaly({ type: "cache_drop" }));
    expect(execMock).toHaveBeenCalledTimes(2);
  });

  it("exposes sane defaults", () => {
    expect(DEFAULT_ALERT_CONFIG.minSeverity).toBe("critical");
    expect(DEFAULT_ALERT_CONFIG.channels).toContain("desktop");
  });
});

describe("desktopNotify", () => {
  beforeEach(() => execMock.mockClear());

  it("never throws even if exec throws synchronously", () => {
    execMock.mockImplementationOnce(() => {
      throw new Error("spawn failed");
    });
    expect(() => desktopNotify("title", 'body with "quotes" and \\backslash')).not.toThrow();
  });
});

describe("loadAlertConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kerf-alerts-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const config = loadAlertConfig(join(dir, "missing.json"));
    expect(config).toEqual(DEFAULT_ALERT_CONFIG);
  });

  it("overlays persisted alert settings over defaults", () => {
    const path = join(dir, "config.json");
    saveConfigFile(
      { alerts: { minSeverity: "warning", webhookUrl: "https://hook.test" } },
      path,
    );
    const config = loadAlertConfig(path);
    expect(config.minSeverity).toBe("warning");
    expect(config.webhookUrl).toBe("https://hook.test");
    // Unspecified fields fall back to defaults.
    expect(config.debounceSeconds).toBe(DEFAULT_ALERT_CONFIG.debounceSeconds);
  });

  it("ignores an empty channels array and keeps defaults", () => {
    const path = join(dir, "config.json");
    writeFileSync(path, JSON.stringify({ alerts: { channels: [] } }));
    const config = loadAlertConfig(path);
    expect(config.channels).toEqual(DEFAULT_ALERT_CONFIG.channels);
  });
});

describe("webhookNotify", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never throws when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    await expect(webhookNotify("https://example.com/hook", makeAnomaly())).resolves.toBeUndefined();
  });

  it("posts a JSON body to the webhook URL on success", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("ok")));
    vi.stubGlobal("fetch", fetchMock);
    await webhookNotify("https://example.com/hook", makeAnomaly());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.com/hook");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.text).toContain("kerf alert [critical]");
  });
});
