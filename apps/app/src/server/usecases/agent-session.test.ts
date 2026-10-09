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

import { AgentSessionUseCase } from "./agent-session";
import type { Database } from "./adaptors/database";
import type { Runtime } from "./adaptors/runtime";
import type { Agent, AgentSession, Context, PaginatedResult } from "@/entities";

function makeDatabase(): Database {
  return {
    appendAgentSessionEvents: vi.fn().mockResolvedValue(2),
    listAgentSessionSummaries: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    getAgentSession: vi.fn().mockResolvedValue({ sessionId: "hermes-session-1", events: [] }),
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

function makeBatch(overrides: Partial<AgentSession> = {}): AgentSession {
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
  } as AgentSession;
}

function makeUseCase(db: Database, runtime: Runtime): AgentSessionUseCase {
  // Constructors of the inherited mixin chain accept the injected adaptors in
  // BaseUseCase order: runtime, files, skillIndex, logger, db.
  return new (AgentSessionUseCase as unknown as new (
    runtime: Runtime,
    files: unknown,
    skillIndex: unknown,
    logger: unknown,
    db: Database
  ) => AgentSessionUseCase)(runtime, {}, {}, { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }, db);
}

describe("AgentSessionUseCase.ingestAgentSessionEvents", () => {
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

describe("AgentSessionUseCase.listAgentSessionSummaries", () => {
  const page: PaginatedResult<{
    sessionId: string;
    firstEventAt: string;
    lastEventAt: string;
    eventCount: number;
  }> = {
    items: [
      {
        sessionId: "hermes-session-1",
        firstEventAt: "2026-10-06T16:04:25.000Z",
        lastEventAt: "2026-10-06T16:04:26.000Z",
        eventCount: 2,
      },
    ],
    hasMore: false,
  };

  it("returns the page for the agent without an ownership check", async () => {
    const db = makeDatabase();
    (db.listAgentSessionSummaries as ReturnType<typeof vi.fn>).mockResolvedValue(page);
    const usecase = makeUseCase(db, makeRuntime(makeAgent({ userId: "other-user" })));

    const result = await usecase.listAgentSessionSummaries(makeCtx("other-user"), "agent-1", {
      limit: 20,
      offset: 0,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.sessionId).toBe("hermes-session-1");
    expect(result.hasMore).toBe(false);
  });

  it("passes the query through to the database without defaulting", async () => {
    const db = makeDatabase();
    (db.listAgentSessionSummaries as ReturnType<typeof vi.fn>).mockResolvedValue(page);
    const usecase = makeUseCase(db, makeRuntime(null));

    await usecase.listAgentSessionSummaries(makeCtx(), "agent-1", { limit: 20, offset: 0 });

    expect(db.listAgentSessionSummaries).toHaveBeenCalledWith("agent-1", { limit: 20, offset: 0 });
  });

  it("passes an arbitrary page request through unchanged", async () => {
    const db = makeDatabase();
    (db.listAgentSessionSummaries as ReturnType<typeof vi.fn>).mockResolvedValue(page);
    const usecase = makeUseCase(db, makeRuntime(null));

    await usecase.listAgentSessionSummaries(makeCtx(), "agent-1", { limit: 5, offset: 10 });

    expect(db.listAgentSessionSummaries).toHaveBeenCalledWith("agent-1", { limit: 5, offset: 10 });
  });

  it("does not consult the runtime at all", async () => {
    const runtime = makeRuntime(null);
    const db = makeDatabase();
    const usecase = makeUseCase(db, runtime);

    await usecase.listAgentSessionSummaries(makeCtx(), "agent-1", { limit: 20, offset: 0 });

    expect(runtime.getHermesAgent).not.toHaveBeenCalled();
    expect(db.listAgentSessionSummaries).toHaveBeenCalledWith("agent-1", { limit: 20, offset: 0 });
  });
});

describe("AgentSessionUseCase.getAgentSession", () => {
  it("returns the ordered events for the session without an ownership check", async () => {
    const db = makeDatabase();
    const usecase = makeUseCase(db, makeRuntime(makeAgent({ userId: "other-user" })));

    await usecase.getAgentSession(makeCtx("other-user"), "agent-1", "hermes-session-1");

    expect(db.getAgentSession).toHaveBeenCalledWith("agent-1", "hermes-session-1");
  });

  it("does not consult the runtime at all", async () => {
    const runtime = makeRuntime(null);
    const db = makeDatabase();
    const usecase = makeUseCase(db, runtime);

    await usecase.getAgentSession(makeCtx(), "agent-1", "hermes-session-1");

    expect(runtime.getHermesAgent).not.toHaveBeenCalled();
    expect(db.getAgentSession).toHaveBeenCalledWith("agent-1", "hermes-session-1");
  });
});