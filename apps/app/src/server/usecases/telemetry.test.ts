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
  config: { configPath: "./config.yaml", hermesDocsPath: "./docs" },
}));

import { TelemetryUseCase } from "./telemetry";
import type { Database } from "./adaptors/database";
import type { Runtime } from "./adaptors/runtime";
import type { Agent, AgentSessionEventBatch, Context } from "@/entities";

function makeDatabase(): Database {
  return {
    appendAgentSessionEvents: vi.fn().mockResolvedValue(2),
    listAgentSessions: vi.fn().mockResolvedValue([]),
    getAgentSessionEvents: vi.fn().mockResolvedValue([]),
  };
}

function makeRuntime(agent: Agent | null): Runtime {
  return {
    listHermesAgents: vi.fn(),
    getHermesAgent: vi.fn().mockResolvedValue(agent),
    createHermesAgent: vi.fn(),
    patchHermesAgent: vi.fn(),
    archiveHermesAgent: vi.fn(),
    listSharedEnvSets: vi.fn(),
    getSharedEnvSet: vi.fn(),
    createSharedEnvSet: vi.fn(),
    archiveSharedEnvSet: vi.fn(),
    patchSharedEnvSet: vi.fn(),
    addEnvVar: vi.fn(),
    updateEnvVar: vi.fn(),
    removeEnvVar: vi.fn(),
  } as unknown as Runtime;
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    userId: "user-1",
    ...overrides,
  } as Agent;
}

function makeCtx(userId = "user-1"): Context {
  return {
    session: { id: "session-1", userId, expiresAt: new Date() },
    user: { id: userId, email: "user@example.com", name: "User", createdAt: new Date() },
  };
}

function makeBatch(overrides: Partial<AgentSessionEventBatch> = {}): AgentSessionEventBatch {
  return {
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
      {
        eventId: "22222222-2222-4222-8222-222222222222",
        type: "session_finalized",
        timestamp: "2026-10-06T16:04:26.000Z",
        output: { content: "done", toolCalls: [] },
      },
    ],
    ...overrides,
  } as AgentSessionEventBatch;
}

function makeUseCase(db: Database, runtime: Runtime): TelemetryUseCase {
  // Constructors of the inherited mixin chain accept the injected adaptors in
  // BaseUseCase order: runtime, files, skillIndex, logger, db.
  return new (TelemetryUseCase as unknown as new (
    runtime: Runtime,
    files: unknown,
    skillIndex: unknown,
    logger: unknown,
    db: Database
  ) => TelemetryUseCase)(runtime, {}, {}, { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }, db);
}

describe("TelemetryUseCase.ingestAgentSessionEvents", () => {
  it("appends the batch to the database with a null agentId and returns the accepted count", async () => {
    const db = makeDatabase();
    const usecase = makeUseCase(db, makeRuntime(null));
    const batch = makeBatch();

    const accepted = await usecase.ingestAgentSessionEvents(batch);

    expect(accepted).toBe(2);
    expect(db.appendAgentSessionEvents).toHaveBeenCalledWith({
      agentId: null,
      sessionId: "hermes-session-1",
      events: batch.events,
    });
  });

  it("passes an explicit agentId through when provided", async () => {
    const db = makeDatabase();
    const usecase = makeUseCase(db, makeRuntime(null));

    await usecase.ingestAgentSessionEvents(makeBatch(), "agent-1");

    expect(db.appendAgentSessionEvents).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-1" })
    );
  });
});

describe("TelemetryUseCase.listAgentSessions", () => {
  it("returns the sessions owned by the agent", async () => {
    const db = makeDatabase();
    (db.listAgentSessions as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        sessionId: "hermes-session-1",
        firstEventAt: "2026-10-06T16:04:25.000Z",
        lastEventAt: "2026-10-06T16:04:26.000Z",
        eventCount: 2,
      },
    ]);
    const usecase = makeUseCase(db, makeRuntime(makeAgent()));

    const sessions = await usecase.listAgentSessions(makeCtx(), "agent-1");

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.sessionId).toBe("hermes-session-1");
    expect(db.listAgentSessions).toHaveBeenCalledWith("agent-1");
  });

  it("throws when the agent does not exist", async () => {
    const db = makeDatabase();
    const usecase = makeUseCase(db, makeRuntime(null));

    await expect(usecase.listAgentSessions(makeCtx(), "agent-1")).rejects.toThrow(
      "HermesAgent agent-1 not found"
    );
    expect(db.listAgentSessions).not.toHaveBeenCalled();
  });

  it("throws when the requesting user does not own the agent", async () => {
    const db = makeDatabase();
    const usecase = makeUseCase(db, makeRuntime(makeAgent({ userId: "other-user" })));

    await expect(usecase.listAgentSessions(makeCtx(), "agent-1")).rejects.toThrow(
      "You don't have permission to perform this action"
    );
    expect(db.listAgentSessions).not.toHaveBeenCalled();
  });
});

describe("TelemetryUseCase.getAgentSession", () => {
  it("returns the ordered events for the session", async () => {
    const db = makeDatabase();
    const usecase = makeUseCase(db, makeRuntime(makeAgent()));

    await usecase.getAgentSession(makeCtx(), "agent-1", "hermes-session-1");

    expect(db.getAgentSessionEvents).toHaveBeenCalledWith("agent-1", "hermes-session-1");
  });

  it("throws when the agent does not exist", async () => {
    const db = makeDatabase();
    const usecase = makeUseCase(db, makeRuntime(null));

    await expect(
      usecase.getAgentSession(makeCtx(), "agent-1", "hermes-session-1")
    ).rejects.toThrow("HermesAgent agent-1 not found");
    expect(db.getAgentSessionEvents).not.toHaveBeenCalled();
  });

  it("throws when the requesting user does not own the agent", async () => {
    const db = makeDatabase();
    const usecase = makeUseCase(db, makeRuntime(makeAgent({ userId: "other-user" })));

    await expect(
      usecase.getAgentSession(makeCtx(), "agent-1", "hermes-session-1")
    ).rejects.toThrow("You don't have permission to perform this action");
    expect(db.getAgentSessionEvents).not.toHaveBeenCalled();
  });
});