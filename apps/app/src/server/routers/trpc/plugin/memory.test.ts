import { describe, it, expect, vi, beforeEach } from "vitest";

const { readForAgent, findAgentIdByTokenHash } = vi.hoisted(() => ({
  readForAgent: vi.fn(),
  findAgentIdByTokenHash: vi.fn(),
}));

// The plugin memory router is read-only and thin: the use case is mocked so the
// test only asserts procedure wiring and token gating. mixin is mocked for the
// token lookup (plugin/shared.ts) and agent-session for its router import.
vi.mock("@/server/usecases/agent-memory", () => ({
  AgentMemoryUseCase: class {
    readForAgent = readForAgent;
  },
}));
vi.mock("@/server/usecases/mixin", () => ({
  sharedDatabase: { findAgentIdByTokenHash },
}));
vi.mock("@/server/usecases/agent-session", () => ({
  AgentSessionUseCase: class {},
}));

import { pluginRouter } from "./index.js";
import { createPluginTRPCContext } from "./shared.js";
import { generatePluginToken, hashPluginToken } from "@/server/libs/plugin-token";
import type { AgentMemoryEntry } from "@/entities";
import type { Request } from "express";

const ENTRY: AgentMemoryEntry = {
  id: "entry-1",
  agentId: "agent-1",
  content: "operator-authored context",
  createdAt: "2026-11-02T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
};

function makeRequest(authorization?: string): Request {
  return { headers: authorization ? { authorization } : {} } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agentMemoryRouter token guard", () => {
  it("rejects reads without a resolved agent", async () => {
    await expect(pluginRouter.createCaller({ agentId: null }).agentMemory.read()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(readForAgent).not.toHaveBeenCalled();
  });
});

describe("agentMemoryRouter read", () => {
  it("reads the resolved agent's entries", async () => {
    readForAgent.mockResolvedValue([ENTRY]);

    const result = await pluginRouter.createCaller({ agentId: "agent-1" }).agentMemory.read();

    expect(result).toEqual({ entries: [ENTRY] });
    expect(readForAgent).toHaveBeenCalledWith("agent-1");
  });

  it("stamps the read with the agent the bearer token resolves to", async () => {
    const token = generatePluginToken();
    findAgentIdByTokenHash.mockResolvedValue("agent-42");
    readForAgent.mockResolvedValue([{ ...ENTRY, agentId: "agent-42" }]);

    const ctx = await createPluginTRPCContext()({ req: makeRequest(`Bearer ${token}`) });
    const { entries } = await pluginRouter.createCaller(ctx).agentMemory.read();

    expect(findAgentIdByTokenHash).toHaveBeenCalledWith(hashPluginToken(token));
    expect(readForAgent).toHaveBeenCalledWith("agent-42");
    expect(entries[0]?.agentId).toBe("agent-42");
  });
});
