import { describe, it, expect } from "vitest";

import {
  deriveAgentSessionStatusFromEvents,
  formatDurationMs,
  formatDurationParts,
  formatTokens,
  formatUsd,
  splitDurationMs,
  summarizeSessionStats,
} from "./session-stats";

import { AGENT_SESSION_INACTIVITY_MS } from "@/entities";
import type { AgentSessionEvent } from "@/entities";

const T0 = "2026-09-03T12:00:00.000Z";
const NOW = Date.parse(T0) + 34 * 86400e3 + 19 * 3600e3;

let seq = 0;
const llmCall = (
  timestamp: string,
  overrides: Partial<Extract<AgentSessionEvent, { type: "llm_call" }>> = {}
): AgentSessionEvent => ({
  eventId: `evt_${String(++seq).padStart(2, "0")}`,
  type: "llm_call",
  timestamp,
  provider: "anthropic",
  model: "claude-sonnet",
  apiMode: "messages",
  assistant: { content: "ok", toolCalls: [] },
  usage: { inputTokens: 0, outputTokens: 0 },
  cost: { totalUsd: null },
  ...overrides,
});

const toolCall = (timestamp: string, durationS?: number): AgentSessionEvent => ({
  eventId: `evt_${String(++seq).padStart(2, "0")}`,
  type: "tool_call",
  timestamp,
  toolName: "read_file",
  toolCallId: "tc_1",
  args: undefined,
  result: undefined,
  durationS,
});

const sessionStarted = (timestamp: string): AgentSessionEvent => ({
  eventId: `evt_${String(++seq).padStart(2, "0")}`,
  type: "session_started",
  timestamp,
  platform: "cli",
  model: "claude-sonnet",
});

const sessionFinalized = (timestamp: string): AgentSessionEvent => ({
  eventId: `evt_${String(++seq).padStart(2, "0")}`,
  type: "session_finalized",
  timestamp,
  output: { content: "done", toolCalls: [] },
});

describe("deriveAgentSessionStatusFromEvents", () => {
  it("is finalized when the latest event is a session_finalized event, regardless of age", () => {
    const old = new Date(NOW - 30 * AGENT_SESSION_INACTIVITY_MS).toISOString();
    expect(deriveAgentSessionStatusFromEvents([llmCall(T0), sessionFinalized(old)], NOW)).toBe("finalized");
  });

  it("is active while the latest event is recent, even when the session was created long ago", () => {
    const events = [sessionStarted(T0), llmCall(new Date(NOW - 40 * 60e3).toISOString())];
    expect(deriveAgentSessionStatusFromEvents(events, NOW)).toBe("active");
  });

  it("is inactive once the latest event ages past the inactivity window", () => {
    const events = [llmCall(T0), toolCall(new Date(NOW - AGENT_SESSION_INACTIVITY_MS - 1).toISOString())];
    expect(deriveAgentSessionStatusFromEvents(events, NOW)).toBe("inactive");
  });

  it("is inactive for a session with no events", () => {
    expect(deriveAgentSessionStatusFromEvents([], NOW)).toBe("inactive");
  });
});

describe("summarizeSessionStats", () => {
  it("returns zeroed stats for an empty session", () => {
    expect(summarizeSessionStats([])).toEqual({
      wallClockMs: null,
      activeMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: null,
      totalCostUsd: null,
    });
  });

  it("sums wall-clock, active time, and usage across llm/tool events", () => {
    const events = [
      sessionStarted(T0),
      llmCall(T0, {
        durationS: 1.5,
        usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 400 },
        cost: { totalUsd: 0.02 },
      }),
      toolCall("2026-09-03T12:00:02.000Z", 0.58),
      llmCall("2026-09-03T12:00:05.000Z", {
        durationS: 3.25,
        usage: { inputTokens: 500, outputTokens: 90 },
        cost: { totalUsd: 0.01 },
      }),
    ];
    expect(summarizeSessionStats(events, NOW)).toEqual({
      wallClockMs: 34 * 86400e3 + 19 * 3600e3,
      activeMs: 1.5e3 + 0.58e3 + 3.25e3,
      inputTokens: 1500,
      outputTokens: 290,
      cacheReadTokens: 400,
      totalCostUsd: 0.03,
    });
  });

  it("reports Unknown cost (null) when any llm_call total is unmeasurable", () => {
    const events = [
      llmCall(T0, { cost: { totalUsd: 0.02 } }),
      llmCall(T0, { cost: { totalUsd: null } }),
    ];
    expect(summarizeSessionStats(events, NOW).totalCostUsd).toBeNull();
  });

  it("reports Unknown cost (null) with no llm_call events at all", () => {
    expect(summarizeSessionStats([toolCall(T0, 1)], NOW).totalCostUsd).toBeNull();
  });

  it("hides the cache-read breakdown when no usage reports it", () => {
    expect(summarizeSessionStats([llmCall(T0)], NOW).cacheReadTokens).toBeNull();
  });

  it("counts wall-clock from the first event regardless of its type, clamped at zero", () => {
    expect(summarizeSessionStats([toolCall(T0, 1)], NOW).wallClockMs).toBe(34 * 86400e3 + 19 * 3600e3);
    expect(summarizeSessionStats([toolCall(T0, 1)], Date.parse(T0) - 1).wallClockMs).toBe(0);
  });

  it("skips calls without a measured duration", () => {
    const events = [llmCall(T0), toolCall(T0), llmCall(T0, { durationS: 2 })];
    expect(summarizeSessionStats(events, NOW).activeMs).toBe(2000);
  });
});

describe("splitDurationMs", () => {
  it("splits into units by flooring", () => {
    expect(splitDurationMs(90_000)).toEqual({ days: 0, hours: 0, minutes: 1, seconds: 30 });
    expect(splitDurationMs(123_456_789)).toEqual({ days: 1, hours: 10, minutes: 17, seconds: 36 });
  });

  it("clamps negative values to all-zero", () => {
    expect(splitDurationMs(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe("formatDurationMs", () => {
  it("formats the two most significant units, matching the reference style", () => {
    expect(formatDurationMs(0)).toBe("0s");
    expect(formatDurationMs(20_800)).toBe("20s");
    expect(formatDurationMs(90_000)).toBe("1m 30s");
    expect(formatDurationMs(5 * 60e3)).toBe("5m");
    expect(formatDurationMs(19 * 3600e3)).toBe("19h");
    expect(formatDurationMs(2 * 3600e3 + 3 * 60e3)).toBe("2h 3m");
    expect(formatDurationMs(34 * 86400e3 + 19 * 3600e3)).toBe("34d 19h");
    // Seconds are dropped once the value reaches days, matching the list view.
    expect(formatDurationMs(34 * 86400e3 + 19 * 3600e3 + 5 * 60e3)).toBe("34d 19h");
  });

  it("keeps the fallback formatter in parity with the native path", () => {
    // Runs against native Intl.DurationFormat where available (local), and
    // against itself on Node < 23 (CI) — the two paths must always agree.
    for (const ms of [
      0,
      20_800,
      90_000,
      5 * 60e3,
      19 * 3600e3,
      2 * 3600e3 + 3 * 60e3,
      34 * 86400e3 + 19 * 3600e3,
      34 * 86400e3 + 19 * 3600e3 + 5 * 60e3,
    ]) {
      expect(formatDurationParts(splitDurationMs(ms))).toBe(formatDurationMs(ms));
    }
  });
});

describe("formatTokens", () => {
  it("uses compact notation", () => {
    expect(formatTokens(842)).toBe("842");
    expect(formatTokens(1400)).toBe("1.4K");
    expect(formatTokens(39_400)).toBe("39.4K");
    expect(formatTokens(1_000_000)).toBe("1M");
  });
});

describe("formatUsd", () => {
  it("formats USD currency", () => {
    expect(formatUsd(0.06)).toBe("$0.06");
    expect(formatUsd(0)).toBe("$0.00");
  });
});