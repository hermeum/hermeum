import { describe, it, expect } from "vitest";

import {
  agentEnvResourceName,
  agentToHermesAgent,
  hashAgentEnv,
  maskSensitiveEnv,
  splitAgentEnv,
} from "./client";
import type { Agent } from "@/entities";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    userId: "user-1",
    ...overrides,
  } as Agent;
}

describe("agentEnvResourceName", () => {
  it("derives the ConfigMap/Secret name from the agent id", () => {
    expect(agentEnvResourceName("agent-1")).toBe("agent-1-dot-env");
  });
});

describe("splitAgentEnv", () => {
  it("partitions env vars into ConfigMap and Secret data by sensitivity", () => {
    const { configMapData, secretData } = splitAgentEnv([
      { name: "REGION", value: "us-east-1" },
      { name: "API_KEY", value: "shh", sensitive: true },
    ]);
    expect(configMapData).toEqual({ REGION: "us-east-1" });
    expect(secretData).toEqual({ API_KEY: "shh" });
  });

  it("returns empty objects for undefined env", () => {
    expect(splitAgentEnv(undefined)).toEqual({ configMapData: {}, secretData: {} });
  });
});

describe("maskSensitiveEnv", () => {
  it("replaces sensitive values with the secret sentinel and leaves others untouched", () => {
    const masked = maskSensitiveEnv([
      { name: "REGION", value: "us-east-1" },
      { name: "API_KEY", value: "shh", sensitive: true },
    ]);
    expect(masked).toEqual([
      { name: "REGION", value: "us-east-1" },
      { name: "API_KEY", value: "<secret>", sensitive: true },
    ]);
  });

  it("passes through undefined", () => {
    expect(maskSensitiveEnv(undefined)).toBeUndefined();
  });
});

describe("hashAgentEnv", () => {
  it("is stable for equivalent env content regardless of order", () => {
    const a = hashAgentEnv([
      { name: "REGION", value: "us-east-1" },
      { name: "API_KEY", value: "shh", sensitive: true },
    ]);
    const b = hashAgentEnv([
      { name: "API_KEY", value: "shh", sensitive: true },
      { name: "REGION", value: "us-east-1" },
    ]);
    expect(a).toBe(b);
  });

  it("changes when a value changes", () => {
    const a = hashAgentEnv([{ name: "REGION", value: "us-east-1" }]);
    const b = hashAgentEnv([{ name: "REGION", value: "us-west-2" }]);
    expect(a).not.toBe(b);
  });

  it("changes when a var is added or removed", () => {
    const a = hashAgentEnv([{ name: "REGION", value: "us-east-1" }]);
    const b = hashAgentEnv([
      { name: "REGION", value: "us-east-1" },
      { name: "API_KEY", value: "shh", sensitive: true },
    ]);
    expect(a).not.toBe(b);
  });

  it("is stable across undefined and empty array", () => {
    expect(hashAgentEnv(undefined)).toBe(hashAgentEnv([]));
  });
});

describe("agentToHermesAgent workspace.dotEnv wiring", () => {
  it("always sets both configMapRef and secretRef to the same agent-derived name", () => {
    const hermesAgent = agentToHermesAgent(makeAgent());
    expect(hermesAgent.spec.hermes?.workspace?.dotEnv).toEqual({
      configMapRef: { name: "agent-1-dot-env" },
      secretRef: { name: "agent-1-dot-env" },
    });
  });

  it("includes the SOUL.md file alongside dotEnv when soul is set", () => {
    const hermesAgent = agentToHermesAgent(makeAgent({ soul: "You are helpful." }));
    expect(hermesAgent.spec.hermes?.workspace?.files).toEqual({ "SOUL.md": "You are helpful." });
    expect(hermesAgent.spec.hermes?.workspace?.dotEnv).toEqual({
      configMapRef: { name: "agent-1-dot-env" },
      secretRef: { name: "agent-1-dot-env" },
    });
  });
});

describe("agentToHermesAgent podAnnotations wiring", () => {
  it("stamps an env-hash annotation derived from agent.env", () => {
    const env = [{ name: "REGION", value: "us-east-1" }];
    const hermesAgent = agentToHermesAgent(makeAgent({ env }));
    expect(hermesAgent.spec.podAnnotations).toEqual({ "hermeum.app/env-hash": hashAgentEnv(env) });
  });

  it("changes the annotation when env content changes", () => {
    const a = agentToHermesAgent(makeAgent({ env: [{ name: "REGION", value: "us-east-1" }] }));
    const b = agentToHermesAgent(makeAgent({ env: [{ name: "REGION", value: "us-west-2" }] }));
    expect(a.spec.podAnnotations).not.toEqual(b.spec.podAnnotations);
  });
});
