import { describe, it, expect, vi, beforeEach } from "vitest";

const { findAgentIdByTokenHash, ingestAgentSessionEvents } = vi.hoisted(() => ({
  findAgentIdByTokenHash: vi.fn(),
  ingestAgentSessionEvents: vi.fn(),
}));

// mixin is mocked so importing plugin/shared.ts doesn't pull the real
// singleton (config + database clients); agent-session is mocked so the
// router's module-level use case never touches real adaptors.
vi.mock("@/server/usecases/mixin", () => ({
  sharedDatabase: { findAgentIdByTokenHash },
}));
vi.mock("@/server/usecases/agent-session", () => ({
  AgentSessionUseCase: class {
    ingestAgentSessionEvents = ingestAgentSessionEvents;
  },
}));

import { pluginRouter } from "./index.js";
import { createPluginTRPCContext } from "./shared.js";
import { generatePluginToken, hashPluginToken } from "@/server/libs/plugin-token";
import type { AgentSession } from "@/entities";
import type { Request } from "express";

function makeRequest(authorization?: string): Request {
  return { headers: authorization ? { authorization } : {} } as unknown as Request;
}

const BATCH: AgentSession = {
  sessionId: "hermes-session-1",
  events: [
    {
      eventId: "11111111-1111-4111-8111-111111111111",
      type: "session_started",
      timestamp: "2026-10-06T16:04:25.000Z",
      platform: "api",
      provider: "openrouter",
      model: "test-model",
      apiMode: "completions",
    },
  ],
};

describe("createPluginTRPCContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the agent id from a valid bearer token", async () => {
    const token = generatePluginToken();
    findAgentIdByTokenHash.mockResolvedValue("agent-1");

    const ctx = await createPluginTRPCContext()({ req: makeRequest(`Bearer ${token}`) });

    // Only the digest is ever looked up — the raw token never touches storage.
    expect(findAgentIdByTokenHash).toHaveBeenCalledWith(hashPluginToken(token));
    expect(ctx.agentId).toBe("agent-1");
  });

  it("yields a null agent id without an authorization header", async () => {
    const ctx = await createPluginTRPCContext()({ req: makeRequest() });
    expect(ctx.agentId).toBeNull();
    expect(findAgentIdByTokenHash).not.toHaveBeenCalled();
  });

  it("yields a null agent id for a non-bearer authorization header", async () => {
    const ctx = await createPluginTRPCContext()({ req: makeRequest("Basic dXNlcjpwYXNz") });
    expect(ctx.agentId).toBeNull();
    expect(findAgentIdByTokenHash).not.toHaveBeenCalled();
  });

  it("yields a null agent id for an unknown or revoked token", async () => {
    findAgentIdByTokenHash.mockResolvedValue(null);
    const ctx = await createPluginTRPCContext()({ req: makeRequest("Bearer hmt_unknown") });
    expect(ctx.agentId).toBeNull();
  });
});

describe("pluginRouter token guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects health without a resolved agent", async () => {
    await expect(
      pluginRouter.createCaller({ agentId: null }).agentSession.health()
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("answers health with a resolved agent", async () => {
    await expect(
      pluginRouter.createCaller({ agentId: "agent-1" }).agentSession.health()
    ).resolves.toEqual({ ok: true });
  });

  it("rejects ingest without a resolved agent", async () => {
    await expect(
      pluginRouter.createCaller({ agentId: null }).agentSession.agentSessionEvents(BATCH)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(ingestAgentSessionEvents).not.toHaveBeenCalled();
  });

  it("ingests with the resolved agent id and returns the accepted count", async () => {
    ingestAgentSessionEvents.mockResolvedValue(1);

    const ack = await pluginRouter
      .createCaller({ agentId: "agent-1" })
      .agentSession.agentSessionEvents(BATCH);

    expect(ingestAgentSessionEvents).toHaveBeenCalledWith(BATCH, "agent-1");
    expect(ack).toEqual({ accepted: 1 });
  });

  it("stamps ingest with the agent the bearer token resolves to (context → caller)", async () => {
    const token = generatePluginToken();
    findAgentIdByTokenHash.mockResolvedValue("agent-42");
    ingestAgentSessionEvents.mockResolvedValue(1);

    const ctx = await createPluginTRPCContext()({ req: makeRequest(`Bearer ${token}`) });
    await pluginRouter.createCaller(ctx).agentSession.agentSessionEvents(BATCH);

    expect(ingestAgentSessionEvents).toHaveBeenCalledWith(BATCH, "agent-42");
  });
});