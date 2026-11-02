import { describe, it, expect, vi, beforeEach } from "vitest";

const { findAgentIdByTokenHash } = vi.hoisted(() => ({
  findAgentIdByTokenHash: vi.fn(),
}));

// mixin is mocked so importing the plugin routers never constructs the real
// process-wide adaptors (config, database clients, Kubernetes). The memory
// use case keeps its real implementation and runs against this map-backed
// database double; the agent-session use case is stubbed because its router
// imports it.
vi.mock("@/server/usecases/mixin", () => {
  const byAgent = new Map<string, Record<string, unknown>[]>();
  const memoryDb = {
    async listMemoryEntries(agentId: string) {
      return (byAgent.get(agentId) ?? []).map((entry) => ({ ...entry }));
    },
    async saveMemoryEntries(agentId: string, entries: Record<string, unknown>[]) {
      byAgent.set(
        agentId,
        entries.map((entry) => ({ ...entry }))
      );
    },
  };
  return {
    BaseUseCase: class {
      logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      db = memoryDb;
    },
    // The memory use case extends OwnershipGuarded(BaseUseCase); the plugin
    // procedures exercised here never need the ownership methods.
    OwnershipGuarded: (Base: new () => object) => class extends Base {},
    sharedDatabase: { findAgentIdByTokenHash },
  };
});
vi.mock("@/server/usecases/agent-session", () => ({
  AgentSessionUseCase: class {},
}));

import { pluginRouter } from "./index.js";
import { createPluginTRPCContext } from "./shared.js";
import { generatePluginToken, hashPluginToken } from "@/server/libs/plugin-token";
import type { Request } from "express";

function makeRequest(authorization?: string): Request {
  return { headers: authorization ? { authorization } : {} } as unknown as Request;
}

describe("agentMemoryRouter token guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects reads without a resolved agent", async () => {
    await expect(pluginRouter.createCaller({ agentId: null }).agentMemory.read()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects writes without a resolved agent", async () => {
    await expect(
      pluginRouter
        .createCaller({ agentId: null })
        .agentMemory.batch({ operations: [{ action: "add", content: "x" }] })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("agentMemoryRouter memory operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds an entry, reads it back, and scopes it to the agent", async () => {
    const caller = pluginRouter.createCaller({ agentId: "agent-memory-add" });

    await expect(
      caller.agentMemory.batch({ operations: [{ action: "add", content: "runs macOS" }] })
    ).resolves.toEqual({
      success: true,
      done: true,
      target: "memory",
      entryCount: 1,
      message: "Applied 1 operation(s).",
    });

    const { entries } = await caller.agentMemory.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ agentId: "agent-memory-add", content: "runs macOS" });

    const other = await pluginRouter.createCaller({ agentId: "agent-memory-other" }).agentMemory.read();
    expect(other.entries).toEqual([]);
  });

  it("patches and removes entries", async () => {
    const caller = pluginRouter.createCaller({ agentId: "agent-memory-patch" });
    await caller.agentMemory.batch({ operations: [{ action: "add", content: "dark mode everywhere" }] });

    await expect(
      caller.agentMemory.batch({
        operations: [{ action: "patch", oldText: "dark mode", content: "light mode" }],
      })
    ).resolves.toMatchObject({ success: true, entryCount: 1 });
    expect((await caller.agentMemory.read()).entries[0]?.content).toBe("light mode everywhere");

    await expect(
      caller.agentMemory.batch({ operations: [{ action: "remove", oldText: "light mode" }] })
    ).resolves.toMatchObject({ success: true, entryCount: 0 });
  });

  it("applies a multi-operation batch atomically", async () => {
    const caller = pluginRouter.createCaller({ agentId: "agent-memory-batch" });
    await caller.agentMemory.batch({ operations: [{ action: "add", content: "alpha" }] });

    const result = await caller.agentMemory.batch({
      operations: [
        { action: "patch", oldText: "alpha", content: "beta" },
        { action: "add", content: "gamma" },
      ],
    });

    expect(result).toMatchObject({ success: true, entryCount: 2, message: "Applied 2 operation(s)." });
    const contents = (await caller.agentMemory.read()).entries.map((entry) => entry.content);
    expect(contents).toEqual(["beta", "gamma"]);
  });
});

describe("agentMemoryRouter context resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stamps memory with the agent the bearer token resolves to", async () => {
    const token = generatePluginToken();
    findAgentIdByTokenHash.mockResolvedValue("agent-42");

    const ctx = await createPluginTRPCContext()({ req: makeRequest(`Bearer ${token}`) });
    const caller = pluginRouter.createCaller(ctx);

    await caller.agentMemory.batch({ operations: [{ action: "add", content: "remember this" }] });

    expect(findAgentIdByTokenHash).toHaveBeenCalledWith(hashPluginToken(token));
    const { entries } = await caller.agentMemory.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.agentId).toBe("agent-42");
  });
});
