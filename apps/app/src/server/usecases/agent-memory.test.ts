import { describe, it, expect, vi } from "vitest";

// Importing mixin pulls the process-wide adaptors (config, DB clients,
// Kubernetes); the memory use case only needs BaseUseCase's logger, so stub
// the infra modules like agent-session.test.ts does.
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
  config: { configPath: "./config.yaml", hermesDocsPath: "./docs" },
}));

import { AgentMemoryUseCase } from "./agent-memory";
import type { Database } from "./adaptors/database";
import type { Runtime } from "./adaptors/runtime";
import type { AgentMemoryEntry, Context } from "@/entities";

const AGENT = "agent-1";

// Database double: the memory use case only needs the per-agent entry list;
// the rest of the adaptor is stubbed to satisfy the interface.
function makeDatabase(): Database {
  const byAgent = new Map<string, AgentMemoryEntry[]>();
  return {
    appendAgentSessionEvents: vi.fn(),
    listAgentSessionSummaries: vi.fn(),
    getAgentSession: vi.fn(),
    deleteAgentSessionsLastActiveBefore: vi.fn(),
    storeAgentToken: vi.fn(),
    findAgentIdByTokenHash: vi.fn(),
    revokeAgentToken: vi.fn(),
    listMemoryEntries: vi.fn(async (agentId: string) =>
      (byAgent.get(agentId) ?? []).map((entry) => ({ ...entry }))
    ),
    addMemoryEntry: vi.fn(
      async (agentId: string, entry: Pick<AgentMemoryEntry, "id" | "content">) => {
        const now = new Date().toISOString();
        const stored: AgentMemoryEntry = { ...entry, agentId, createdAt: now, updatedAt: now };
        byAgent.set(agentId, [...(byAgent.get(agentId) ?? []), stored]);
        return { ...stored };
      }
    ),
    patchMemoryEntry: vi.fn(async (agentId: string, id: string, content: string) => {
      const entries = byAgent.get(agentId) ?? [];
      const index = entries.findIndex((entry) => entry.id === id);
      if (index === -1) return null;
      const updated: AgentMemoryEntry = {
        ...entries[index]!,
        content,
        updatedAt: new Date().toISOString(),
      };
      entries[index] = updated;
      byAgent.set(agentId, entries);
      return { ...updated };
    }),
    removeMemoryEntry: vi.fn(async (agentId: string, id: string) => {
      const entries = byAgent.get(agentId) ?? [];
      const next = entries.filter((entry) => entry.id !== id);
      byAgent.set(agentId, next);
      return next.length !== entries.length;
    }),
  } as unknown as Database;
}

function makeRuntime(agent: { id: string; userId: string } | null): Runtime {
  return { getHermesAgent: vi.fn().mockResolvedValue(agent) } as unknown as Runtime;
}

function makeCtx(userId = "user-1"): Context {
  return {
    session: { id: "session-1", userId, expiresAt: new Date() },
    user: { id: userId, email: "user@example.com", name: "User", createdAt: new Date() },
  };
}

function makeUseCase(
  runtime: Runtime = makeRuntime({ id: AGENT, userId: "user-1" }),
  db: Database = makeDatabase()
): AgentMemoryUseCase {
  // BaseUseCase order: runtime, files, skillIndex, logger, db.
  return new AgentMemoryUseCase(runtime, undefined, undefined, undefined, db);
}

describe("AgentMemoryUseCase.readForAgent", () => {
  it("scopes entries per agent", async () => {
    const memory = makeUseCase();
    const ctx = makeCtx();
    await memory.addEntry(ctx, "agent-1", "one");
    await memory.addEntry(ctx, "agent-2", "two");
    await expect(memory.readForAgent("agent-1")).resolves.toHaveLength(1);
    await expect(memory.readForAgent("agent-2")).resolves.toHaveLength(1);
  });

  it("reads without an owner context (token-authenticated plugin path)", async () => {
    const memory = makeUseCase();
    await memory.addEntry(makeCtx(), AGENT, "entry one");
    await expect(memory.readForAgent(AGENT)).resolves.toEqual([
      expect.objectContaining({ agentId: AGENT, content: "entry one" }),
    ]);
  });
});

describe("AgentMemoryUseCase operator entries", () => {
  it("rejects a non-owner on every operation without writing", async () => {
    const db = makeDatabase();
    const memory = makeUseCase(makeRuntime({ id: AGENT, userId: "user-2" }), db);
    const ctx = makeCtx("user-1");

    await expect(memory.listEntries(ctx, AGENT)).rejects.toThrow("don't have permission");
    await expect(memory.addEntry(ctx, AGENT, "x")).rejects.toThrow("don't have permission");
    await expect(memory.patchEntry(ctx, AGENT, "entry-id", "x")).rejects.toThrow(
      "don't have permission"
    );
    await expect(memory.removeEntry(ctx, AGENT, "entry-id")).rejects.toThrow(
      "don't have permission"
    );
    expect(db.addMemoryEntry).not.toHaveBeenCalled();
    expect(db.patchMemoryEntry).not.toHaveBeenCalled();
    expect(db.removeMemoryEntry).not.toHaveBeenCalled();
  });

  it("rejects a missing agent", async () => {
    const memory = makeUseCase(makeRuntime(null), makeDatabase());
    await expect(memory.listEntries(makeCtx(), AGENT)).rejects.toThrow(
      `HermesAgent ${AGENT} not found`
    );
  });

  it("lists entries for the owner", async () => {
    const memory = makeUseCase();
    const ctx = makeCtx();
    await memory.addEntry(ctx, AGENT, "entry one");

    await expect(memory.listEntries(ctx, AGENT)).resolves.toEqual([
      expect.objectContaining({ agentId: AGENT, content: "entry one" }),
    ]);
  });

  it("adds an entry, skips exact duplicates, and rejects empty content", async () => {
    const memory = makeUseCase();
    const ctx = makeCtx();

    const added = await memory.addEntry(ctx, AGENT, "  entry one  ");
    expect(added).toEqual([expect.objectContaining({ content: "entry one" })]);

    await expect(memory.addEntry(ctx, AGENT, "entry one")).resolves.toHaveLength(1);
    await expect(memory.addEntry(ctx, AGENT, "   ")).rejects.toThrow("cannot be empty");
  });

  it("patches an entry by id, keeping the id and the creation time", async () => {
    const memory = makeUseCase();
    const ctx = makeCtx();
    const [entry] = await memory.addEntry(ctx, AGENT, "old content");

    const patched = await memory.patchEntry(ctx, AGENT, entry!.id, "new content");

    expect(patched).toEqual([expect.objectContaining({ id: entry!.id, content: "new content" })]);
    expect(new Date(patched[0]!.createdAt).toISOString()).toBe(
      new Date(entry!.createdAt).toISOString()
    );
    await expect(memory.patchEntry(ctx, AGENT, entry!.id, "  ")).rejects.toThrow("cannot be empty");
  });

  it("rejects an unknown entry id on patch and remove", async () => {
    const memory = makeUseCase();
    const ctx = makeCtx();

    await expect(memory.patchEntry(ctx, AGENT, "missing", "x")).rejects.toThrow("not found");
    await expect(memory.removeEntry(ctx, AGENT, "missing")).rejects.toThrow("not found");
  });

  it("removes an entry by id", async () => {
    const memory = makeUseCase();
    const ctx = makeCtx();
    await memory.addEntry(ctx, AGENT, "entry one");
    const entries = await memory.addEntry(ctx, AGENT, "entry two");

    await memory.removeEntry(ctx, AGENT, entries[0]!.id);

    await expect(memory.listEntries(ctx, AGENT)).resolves.toEqual([
      expect.objectContaining({ content: "entry two" }),
    ]);
  });
});
