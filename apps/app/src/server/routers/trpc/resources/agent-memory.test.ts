import { describe, it, expect, vi, beforeEach } from "vitest";

const { listEntries, addEntry, patchEntry, removeEntry } = vi.hoisted(() => ({
  listEntries: vi.fn(),
  addEntry: vi.fn(),
  patchEntry: vi.fn(),
  removeEntry: vi.fn(),
}));

// The router is a thin pass-through: the use case (ownership guard included) is
// mocked so this test only asserts procedure wiring and session gating. Auth
// and config are stubbed like shared.test.ts, since importing ./shared.js
// pulls the Better Auth singleton.
vi.mock("@/server/routers/better-auth/auth.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/server/libs/config", () => ({ config: { authDisabled: false } }));
vi.mock("@/server/usecases/agent-memory", () => ({
  AgentMemoryUseCase: class {
    listEntries = listEntries;
    addEntry = addEntry;
    patchEntry = patchEntry;
    removeEntry = removeEntry;
  },
}));

import { agentMemoryResourceRouter } from "./agent-memory";
import type { AgentMemoryEntry, Context } from "@/entities";

const ENTRY: AgentMemoryEntry = {
  id: "entry-1",
  agentId: "agent-1",
  content: "runs macOS",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

function makeCtx(userId = "user-1"): Context {
  return {
    session: { id: "session-1", userId, expiresAt: new Date() },
    user: { id: userId, email: "user@example.com", name: "User", createdAt: new Date() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agentMemoryResourceRouter", () => {
  it("rejects a caller without a session", async () => {
    await expect(
      agentMemoryResourceRouter
        .createCaller({ session: null, user: null })
        .list({ agentId: "agent-1" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(listEntries).not.toHaveBeenCalled();
  });

  it("lists entries for the caller's agent", async () => {
    listEntries.mockResolvedValue([ENTRY]);
    const ctx = makeCtx();

    await expect(
      agentMemoryResourceRouter.createCaller(ctx).list({ agentId: "agent-1" })
    ).resolves.toEqual([ENTRY]);
    expect(listEntries).toHaveBeenCalledWith(ctx, "agent-1");
  });

  it("passes add/patch/remove inputs and the session context to the use case", async () => {
    addEntry.mockResolvedValue([ENTRY]);
    patchEntry.mockResolvedValue([ENTRY]);
    removeEntry.mockResolvedValue([]);
    const ctx = makeCtx();
    const caller = agentMemoryResourceRouter.createCaller(ctx);

    await expect(caller.add({ agentId: "agent-1", content: "runs macOS" })).resolves.toEqual([
      ENTRY,
    ]);
    expect(addEntry).toHaveBeenCalledWith(ctx, "agent-1", "runs macOS");

    await expect(
      caller.patch({ agentId: "agent-1", id: "entry-1", content: "runs Linux" })
    ).resolves.toEqual([ENTRY]);
    expect(patchEntry).toHaveBeenCalledWith(ctx, "agent-1", "entry-1", "runs Linux");

    await expect(caller.remove({ agentId: "agent-1", id: "entry-1" })).resolves.toEqual([]);
    expect(removeEntry).toHaveBeenCalledWith(ctx, "agent-1", "entry-1");
  });
});
