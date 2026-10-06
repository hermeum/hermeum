import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captures: { distinctId?: string; event?: string; properties?: Record<string, unknown> }[] = [];
const logRecords: { severityText?: string; body?: string; attributes?: LogAttributesLike }[] = [];
type LogAttributesLike = Record<string, unknown>;

vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = (message: { distinctId?: string; event?: string; properties?: Record<string, unknown> }) => {
      captures.push(message);
    };
    _shutdown = vi.fn();
  },
}));

vi.mock("@opentelemetry/api-logs", () => ({
  SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
  logs: {
    getLogger: () => ({
      emit: (record: { severityText?: string; body?: string; attributes?: Record<string, unknown> }) => {
        logRecords.push(record);
      },
    }),
  },
}));

vi.mock("@opentelemetry/sdk-node", () => {
  const instances: { started: boolean; shutdowns: number }[] = [];
  class MockNodeSDK {
    started = false;
    shutdowns = 0;
    start = () => {
      this.started = true;
    };
    shutdown = async () => {
      this.shutdowns += 1;
    };
    constructor() {
      instances.push(this);
    }
  }
  return { NodeSDK: MockNodeSDK, __instances: instances };
});

vi.mock("@/server/libs/config", () => ({
  config: { databaseDialect: "sqlite", logLevel: "info" },
}));

import * as sdkNode from "@opentelemetry/sdk-node";
import {
  HEARTBEAT_EVENT,
  HEARTBEAT_INTERVAL_MS,
  PostHogTelemetry,
  type PostHogTelemetryOptions,
} from "./posthog";

type MockSDKInstance = { started: boolean; shutdowns: number };
const { __instances } = sdkNode as unknown as { __instances: MockSDKInstance[] };

const baseOptions: PostHogTelemetryOptions = {
  logLevel: "info",
  posthogApiKey: "phc_test",
  posthogHost: "https://us.i.posthog.com",
  deploymentId: "deployment-123",
  telemetryDisabled: false,
  isProduction: true,
};

const lastInstance = () => __instances[__instances.length - 1]!;

describe("PostHogTelemetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captures.length = 0;
    logRecords.length = 0;
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("console logging", () => {
    it("emits logs at or above the configured level", () => {
      const telemetry = new PostHogTelemetry(baseOptions);
      telemetry.debug("hidden", { a: 1 });
      telemetry.info("shown", { b: 2 });

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith("shown", { b: 2 });
    });

    it("emits with an empty context when none is given", () => {
      const telemetry = new PostHogTelemetry(baseOptions);
      telemetry.warn("no context");
      expect(console.warn).toHaveBeenCalledWith("no context", {});
    });

    it("respects the level ordering across warn and error", () => {
      const telemetry = new PostHogTelemetry({ ...baseOptions, logLevel: "error" });
      telemetry.warn("hidden");
      telemetry.error("shown");
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith("shown", {});
    });
  });

  describe("log mirroring to posthog logs", () => {
    it("mirrors console logs as otel log records when enabled", () => {
      const telemetry = new PostHogTelemetry(baseOptions);
      expect(lastInstance().started).toBe(true);

      telemetry.info("mirrored", { key: "value" });
      expect(logRecords).toHaveLength(1);
      expect(logRecords[0]?.severityText).toBe("info");
      expect(logRecords[0]?.body).toBe("mirrored");
      expect(logRecords[0]?.attributes).toEqual({ key: "value" });
    });

    it("does not mirror filtered-out log levels", () => {
      const telemetry = new PostHogTelemetry(baseOptions);
      telemetry.debug("hidden");
      expect(logRecords).toHaveLength(0);
    });

    it("starts no sdk when telemetry is disabled", () => {
      const before = __instances.length;
      const telemetry = new PostHogTelemetry({ ...baseOptions, telemetryDisabled: true });
      expect(__instances.length).toBe(before);
      telemetry.info("console only", { a: 1 });
      expect(logRecords).toHaveLength(0);
      expect(console.info).toHaveBeenCalledWith("console only", { a: 1 });
    });

    it("starts no sdk when no api key is set", () => {
      const before = __instances.length;
      const telemetry = new PostHogTelemetry({ ...baseOptions, posthogApiKey: undefined });
      expect(__instances.length).toBe(before);
      telemetry.error("console only");
      expect(logRecords).toHaveLength(0);
      expect(console.error).toHaveBeenCalledWith("console only", {});
    });
  });

  describe("heartbeat events", () => {
    it("captures a heartbeat event with minimal deployment properties", () => {
      const telemetry = new PostHogTelemetry(baseOptions);
      telemetry.heartbeat();

      expect(captures).toHaveLength(1);
      expect(captures[0]?.distinctId).toBe("deployment-123");
      expect(captures[0]?.event).toBe(HEARTBEAT_EVENT);
      expect(captures[0]?.properties?.hosting).toBe("self-hosted");
      expect(captures[0]?.properties?.version).toBeTruthy();
      expect(captures[0]?.properties?.database_dialect).toBe("sqlite");
    });

    it("merges caller-provided properties into the heartbeat", () => {
      const telemetry = new PostHogTelemetry(baseOptions);
      telemetry.heartbeat({ extra: "value" });

      expect(captures[0]?.properties?.extra).toBe("value");
      expect(captures[0]?.properties?.hosting).toBe("self-hosted");
    });

    it("generates a random distinct id when none is configured", () => {
      const telemetry = new PostHogTelemetry({ ...baseOptions, deploymentId: undefined });
      telemetry.heartbeat();

      expect(captures[0]?.distinctId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("captures heartbeats even when telemetry is disabled", () => {
      const telemetry = new PostHogTelemetry({ ...baseOptions, telemetryDisabled: true });
      telemetry.heartbeat();

      expect(captures).toHaveLength(1);
      expect(captures[0]?.event).toBe(HEARTBEAT_EVENT);
    });

    it("captures heartbeats even when no api key is set", () => {
      const telemetry = new PostHogTelemetry({ ...baseOptions, posthogApiKey: undefined });
      telemetry.heartbeat();

      expect(captures).toHaveLength(1);
      expect(captures[0]?.event).toBe(HEARTBEAT_EVENT);
    });

    it("captures a heartbeat on the hourly interval", () => {
      new PostHogTelemetry({ ...baseOptions, telemetryDisabled: true });
      expect(captures).toHaveLength(0);

      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
      expect(captures).toHaveLength(1);
      expect(captures[0]?.event).toBe(HEARTBEAT_EVENT);
    });

    it("captures no heartbeat and runs no interval outside production", () => {
      const telemetry = new PostHogTelemetry({ ...baseOptions, isProduction: false });
      telemetry.heartbeat();
      expect(captures).toHaveLength(0);

      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
      expect(captures).toHaveLength(0);
    });
  });

  describe("shutdown", () => {
    it("stops the interval and shuts down sdk and event client", async () => {
      const telemetry = new PostHogTelemetry(baseOptions);
      const instance = lastInstance();

      await telemetry.shutdown();
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
      expect(captures).toHaveLength(0);
      expect(logRecords).toHaveLength(0);
      expect(instance.shutdowns).toBe(1);
    });

    it("is safe when no sdk exists", async () => {
      const telemetry = new PostHogTelemetry({ ...baseOptions, posthogApiKey: undefined });
      await expect(telemetry.shutdown()).resolves.toBeUndefined();
    });
  });
});