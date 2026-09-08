import { describe, it, expect, vi } from "vitest";

vi.mock("../infras/kubernetes/client", () => ({ KubernetesClient: vi.fn() }));
vi.mock("../infras/local-files", () => ({ LocalFiles: vi.fn() }));
vi.mock("../infras/posthog", () => ({
  telemetry: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    heartbeat: vi.fn(),
    shutdown: vi.fn(),
  },
}));
vi.mock("@/server/libs/config", () => ({
  config: { configPath: "./config.yaml", hermesDocsPath: "./docs/hermes-config" },
}));

import { stringify } from "yaml";

import { AgentTypeUseCase } from "./agent-type";
import type { FileAdaptor } from "./adaptors/file";
import type { HermeumConfig } from "@/entities";

function makeConfig(agentTypes: HermeumConfig["agentTypes"]): FileAdaptor {
  return {
    listFiles: vi.fn(),
    readFile: vi.fn().mockResolvedValue({
      path: "./config.yaml",
      name: "config",
      content: stringify({ agentTypes, templates: [] }),
      data: {},
    }),
  };
}

describe("AgentTypeUseCase.list", () => {
  it("hides the reserved default type from the picker", async () => {
    const useCase = new AgentTypeUseCase(
      {} as never,
      makeConfig({
        medium: { description: "Medium", mutatingWebhookJsonPatch: [] },
        default: { description: "Fallback", mutatingWebhookJsonPatch: [] },
      })
    );

    await expect(useCase.list()).resolves.toEqual([
      { key: "medium", description: "Medium" },
    ]);
  });

  it("returns all types when no default type is configured", async () => {
    const useCase = new AgentTypeUseCase(
      {} as never,
      makeConfig({
        medium: { description: "Medium", mutatingWebhookJsonPatch: [] },
        large: { mutatingWebhookJsonPatch: [] },
      })
    );

    await expect(useCase.list()).resolves.toEqual([
      { key: "medium", description: "Medium" },
      { key: "large" },
    ]);
  });

  it("returns an empty array when agentTypes is undefined", async () => {
    const useCase = new AgentTypeUseCase({} as never, makeConfig(undefined));

    await expect(useCase.list()).resolves.toEqual([]);
  });
});