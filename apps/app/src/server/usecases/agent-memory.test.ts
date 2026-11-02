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
import type { AgentMemoryOperation } from "./agent-memory";
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
    saveMemoryEntries: vi.fn(async (agentId: string, entries: AgentMemoryEntry[]) => {
      byAgent.set(
        agentId,
        entries.map((entry) => ({ ...entry }))
      );
    }),
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

function batch(memory: AgentMemoryUseCase, operations: AgentMemoryOperation[], agentId = AGENT) {
  return memory.batch(agentId, { operations });
}

describe("AgentMemoryUseCase.read", () => {
  it("scopes entries per agent", async () => {
    const memory = makeUseCase();
    await batch(memory, [{ action: "add", content: "one" }], "agent-1");
    await batch(memory, [{ action: "add", content: "two" }], "agent-2");
    await expect(memory.read("agent-1")).resolves.toHaveLength(1);
    await expect(memory.read("agent-2")).resolves.toHaveLength(1);
  });
});

describe("AgentMemoryUseCase.batch", () => {
  it("rejects an empty operations list", async () => {
    const memory = makeUseCase();
    const result = await memory.batch(AGENT, { operations: [] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("operations list is empty.");
  });

  it("applies add/patch/remove atomically against the final state", async () => {
    const memory = makeUseCase();
    await batch(memory, [{ action: "add", content: "stale entry" }]);
    await batch(memory, [{ action: "add", content: "runs macOS" }]);

    const result = await batch(memory, [
      { action: "remove", oldText: "stale" },
      { action: "patch", oldText: "macOS", content: "Linux" },
      { action: "add", content: "uses zsh" },
    ]);

    expect(result).toEqual({
      success: true,
      done: true,
      target: "memory",
      entryCount: 2,
      message: "Applied 3 operation(s).",
    });
    const contents = (await memory.read(AGENT)).map((entry) => entry.content);
    expect(contents).toEqual(["runs Linux", "uses zsh"]);
  });

  it("rejects an empty add", async () => {
    const memory = makeUseCase();
    const result = await batch(memory, [{ action: "add", content: "   " }]);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Operation 1 (add): content is required.");
    expect(await memory.read(AGENT)).toEqual([]);
  });

  it("skips duplicate adds idempotently", async () => {
    const memory = makeUseCase();
    await batch(memory, [{ action: "add", content: "alpha" }]);

    const result = await batch(memory, [{ action: "add", content: "alpha" }]);

    expect(result).toMatchObject({ success: true, entryCount: 1 });
    expect(await memory.read(AGENT)).toHaveLength(1);
  });

  it("patches one span and keeps the rest of the entry", async () => {
    const memory = makeUseCase();
    await batch(memory, [{ action: "add", content: "User prefers dark mode in all editors" }]);

    await batch(memory, [
      {
        action: "patch",
        oldText: "dark mode in all editors",
        content: "light mode in VS Code, dark mode in terminal",
      },
    ]);

    await expect(memory.read(AGENT)).resolves.toEqual([
      expect.objectContaining({
        content: "User prefers light mode in VS Code, dark mode in terminal",
      }),
    ]);
  });

  it("prefers an exact whole-entry match over substring matches", async () => {
    const memory = makeUseCase();
    await batch(memory, [
      { action: "add", content: "alpha beta" },
      { action: "add", content: "alpha" },
    ]);

    await batch(memory, [{ action: "patch", oldText: "alpha", content: "gamma" }]);

    const contents = (await memory.read(AGENT)).map((entry) => entry.content);
    expect(contents).toEqual(["alpha beta", "gamma"]);
  });

  it("reports ambiguous substring matches", async () => {
    const memory = makeUseCase();
    await batch(memory, [
      { action: "add", content: "dark mode" },
      { action: "add", content: "light mode" },
    ]);

    const result = await batch(memory, [{ action: "patch", oldText: "mode", content: "theme" }]);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain(
      "Operation 1 (patch): 'mode' matched multiple distinct entries -- be more specific."
    );
    // The batch wrote nothing.
    expect((await memory.read(AGENT)).map((entry) => entry.content)).toEqual([
      "dark mode",
      "light mode",
    ]);
  });

  it("rejects a patch span that occurs more than once in the matched entry", async () => {
    const memory = makeUseCase();
    await batch(memory, [{ action: "add", content: "aaa aaa" }]);

    const result = await batch(memory, [{ action: "patch", oldText: "aa", content: "b" }]);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("appears 4 times in the matched entry");
  });

  it("rejects a no-op patch", async () => {
    const memory = makeUseCase();
    await batch(memory, [{ action: "add", content: "hello world" }]);

    const result = await batch(memory, [
      { action: "patch", oldText: "hello", content: "hello" },
    ]);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Patch is a no-op");
  });

  it("returns closest entries when nothing matches", async () => {
    const memory = makeUseCase();
    await batch(memory, [{ action: "add", content: "runs macOS" }]);

    const result = await batch(memory, [
      { action: "patch", oldText: "macOS runs", content: "x" },
    ]);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("No entry matched 'macOS runs'.");
    expect(result.closestEntries).toEqual(["runs macOS"]);
    // Native batch aborts omit the current inventory.
    expect(result).not.toHaveProperty("currentEntries");
  });

  it("requires old_text and content per operation", async () => {
    const memory = makeUseCase();
    const missingOld = await batch(memory, [{ action: "remove" }]);
    expect(missingOld.success).toBe(false);
    if (!missingOld.success) {
      expect(missingOld.error).toContain("Operation 1 (remove): old_text is required.");
    }

    const missingContent = await batch(memory, [{ action: "patch", oldText: "x" }]);
    expect(missingContent.success).toBe(false);
    if (!missingContent.success) {
      expect(missingContent.error).toContain(
        "Operation 1 (patch): content is required — set this operation object's own 'content'"
      );
    }
  });

  it("writes nothing when any operation fails", async () => {
    const memory = makeUseCase();
    await batch(memory, [
      { action: "add", content: "alpha" },
      { action: "add", content: "beta" },
    ]);

    const result = await batch(memory, [
      { action: "patch", oldText: "alpha", content: "ALPHA" },
      { action: "patch", oldText: "zzz", content: "x" },
    ]);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("No operations were applied (batch is all-or-nothing).");
    const contents = (await memory.read(AGENT)).map((entry) => entry.content);
    expect(contents).toEqual(["alpha", "beta"]);
  });

  it("refuses a multi-op batch that empties a non-empty store", async () => {
    const memory = makeUseCase();
    await batch(memory, [
      { action: "add", content: "alpha" },
      { action: "add", content: "beta" },
    ]);

    const result = await batch(memory, [
      { action: "remove", oldText: "alpha" },
      { action: "remove", oldText: "beta" },
    ]);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Refusing to empty memory");
    expect(await memory.read(AGENT)).toHaveLength(2);
  });

  it("allows a deliberate single-op remove of the final entry", async () => {
    const memory = makeUseCase();
    await batch(memory, [{ action: "add", content: "only" }]);

    const result = await batch(memory, [{ action: "remove", oldText: "only" }]);

    expect(result).toMatchObject({ success: true, entryCount: 0 });
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
    expect(db.saveMemoryEntries).not.toHaveBeenCalled();
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
