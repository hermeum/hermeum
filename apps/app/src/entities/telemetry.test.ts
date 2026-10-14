import { describe, it, expect } from "vitest";

import {
  AGENT_SESSION_INACTIVITY_MS,
  deriveAgentSessionStatus,
} from "./telemetry";

const NOW = Date.parse("2026-10-14T12:00:00.000Z");
const MINUTE = 60 * 1000;

describe("deriveAgentSessionStatus", () => {
  it("returns finalized regardless of age — finalization is terminal", () => {
    const longPast = new Date(NOW - 30 * 24 * 3600 * 1000).toISOString();
    expect(deriveAgentSessionStatus(true, longPast, NOW)).toBe("finalized");
    expect(deriveAgentSessionStatus(true, new Date(NOW).toISOString(), NOW)).toBe(
      "finalized"
    );
  });

  it("returns active while the latest event is younger than the inactivity window", () => {
    expect(
      deriveAgentSessionStatus(false, new Date(NOW - 40 * MINUTE).toISOString(), NOW)
    ).toBe("active");
  });

  it("stays active exactly one hour after the latest event — the window is strictly greater", () => {
    expect(
      deriveAgentSessionStatus(false, new Date(NOW - AGENT_SESSION_INACTIVITY_MS).toISOString(), NOW)
    ).toBe("active");
  });

  it("returns inactive once more than one hour passed since the latest event", () => {
    expect(
      deriveAgentSessionStatus(false, new Date(NOW - AGENT_SESSION_INACTIVITY_MS - 1).toISOString(), NOW)
    ).toBe("inactive");
    expect(
      deriveAgentSessionStatus(false, new Date(NOW - 2 * 3600 * 1000).toISOString(), NOW)
    ).toBe("inactive");
  });

  it("defaults now to the current clock", () => {
    const fresh = new Date(Date.now() - 5 * MINUTE).toISOString();
    expect(deriveAgentSessionStatus(false, fresh)).toBe("active");
  });
});