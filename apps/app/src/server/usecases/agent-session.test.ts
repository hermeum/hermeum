import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
import type { TelemetryAdaptor } from "./adaptors/telemetry";
import type { Runtime } from "./adaptors/runtime";
import type { Agent, AgentSession, Context, PaginatedResult } from "@/entities";

function makeDatabase(): Database {
  return {
    appendAgentSessionEvents: vi.fn().mockResolvedValue(2),
    listAgentSessionSummaries: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    getAgentSession: vi.fn().mockResolvedValue({ sessionId: "hermes-session-1", events: [] }),
    deleteAgentSessionsLastActiveBefore: vi.fn().mockResolvedValue(0),
    storeAgentToken: vi.fn(),
    findAgentIdByTokenHash: vi.fn(),
    revokeAgentToken: vi.fn(),
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
        model: "test-model",
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

function makeLogger(): TelemetryAdaptor {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    heartbeat: vi.fn(),
    shutdown: vi.fn(),
  };
}

function makeUseCase(
  db: Database,
  runtime: Runtime,
  logger: TelemetryAdaptor = makeLogger()
): AgentSessionUseCase {
  // Constructors of the inherited mixin chain accept the injected adaptors in
  // BaseUseCase order: runtime, files, skillIndex, logger, db.
  return new (AgentSessionUseCase as unknown as new (
    runtime: Runtime,
    files: unknown,
    skillIndex: unknown,
    logger: unknown,
    db: Database
  ) => AgentSessionUseCase)(runtime, {}, {}, logger, db);
}

describe("AgentSessionUseCase.ingestAgentSessionEvents", () => {
  it("appends the batch to the database with the given agentId and returns the accepted count", async () => {
    const db = makeDatabase();
    const usecase = makeUseCase(db, makeRuntime(null));
    const batch = makeBatch();

    const accepted = await usecase.ingestAgentSessionEvents(batch, "agent-1");

    expect(accepted).toBe(2);
    expect(db.appendAgentSessionEvents).toHaveBeenCalledWith({
      agentId: "agent-1",
      sessionId: "hermes-session-1",
      events: batch.events,
    });
  });

  it("passes a different agentId through unchanged", async () => {
    const db = makeDatabase();
    const usecase = makeUseCase(db, makeRuntime(null));

    await usecase.ingestAgentSessionEvents(makeBatch(), "agent-2");

    expect(db.appendAgentSessionEvents).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-2" })
    );
  });
});

describe("AgentSessionUseCase.listAgentSessionSummaries", () => {
  const page: PaginatedResult<{
    sessionId: string;
    firstEventAt: string;
    lastEventAt: string;
    eventCount: number;
    platform: string | null;
    model: string | null;
    finalized: boolean;
  }> = {
    items: [
      {
        sessionId: "hermes-session-1",
        firstEventAt: "2026-10-06T16:04:25.000Z",
        lastEventAt: "2026-10-06T16:04:26.000Z",
        eventCount: 2,
        platform: "cli",
        model: "gpt-5",
        finalized: true,
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
    expect(result.items[0]!.platform).toBe("cli");
    expect(result.items[0]!.model).toBe("gpt-5");
    expect(result.items[0]!.finalized).toBe(true);
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

describe("AgentSessionUseCase.pruneAgentSessions", () => {
  const MS_PER_DAY = 24 * 3600 * 1000;

  beforeEach(() => {
    // Frozen clock: the cutoff Date must be exactly one window behind it.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes sessions last active before one window ago and returns the count", async () => {
    const frozen = Date.now();
    const db = makeDatabase();
    (db.deleteAgentSessionsLastActiveBefore as ReturnType<typeof vi.fn>).mockResolvedValue(7);
    const logger = makeLogger();
    const usecase = makeUseCase(db, makeRuntime(null), logger);

    const deleted = await usecase.pruneAgentSessions(90);

    expect(deleted).toBe(7);
    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenCalledWith(
      new Date(frozen - 90 * MS_PER_DAY)
    );
    expect(logger.info).toHaveBeenCalledWith("retention pruned agent sessions", {
      cutoff: new Date(frozen - 90 * MS_PER_DAY).toISOString(),
      deleted: 7,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("passes an arbitrary window through unchanged", async () => {
    const frozen = Date.now();
    const db = makeDatabase();
    const usecase = makeUseCase(db, makeRuntime(null));

    await usecase.pruneAgentSessions(30);

    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenCalledWith(
      new Date(frozen - 30 * MS_PER_DAY)
    );
  });
});

describe("AgentSessionUseCase agent-session retention schedule", () => {
  const MS_PER_DAY = 24 * 3600 * 1000;
  const RUN_INTERVAL_MS = 6 * 3600 * 1000;

  let db: Database;
  let logger: TelemetryAdaptor;
  let usecase: AgentSessionUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    db = makeDatabase();
    logger = makeLogger();
    usecase = makeUseCase(db, makeRuntime(null), logger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs immediately on start with a cutoff one window back, then every cycle", async () => {
    const before = Date.now();
    usecase.startAgentSessionRetention(90);

    await vi.advanceTimersByTimeAsync(0);
    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenCalledTimes(1);
    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenLastCalledWith(
      new Date(before - 90 * MS_PER_DAY)
    );

    await vi.advanceTimersByTimeAsync(RUN_INTERVAL_MS - 1);
    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenCalledTimes(2);
    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenLastCalledWith(
      new Date(before + RUN_INTERVAL_MS - 90 * MS_PER_DAY)
    );
    expect(logger.info).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("never schedules anything when retention is disabled (0 days)", async () => {
    usecase.startAgentSessionRetention(0);

    await vi.advanceTimersByTimeAsync(RUN_INTERVAL_MS * 2);

    expect(db.deleteAgentSessionsLastActiveBefore).not.toHaveBeenCalled();
  });

  it("stops further cycles when stopped after startup", async () => {
    usecase.startAgentSessionRetention(90);
    await vi.advanceTimersByTimeAsync(0);
    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenCalledTimes(1);

    usecase.stopAgentSessionRetention();
    await vi.advanceTimersByTimeAsync(RUN_INTERVAL_MS * 2);

    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenCalledTimes(1);
  });

  it("ignores repeated start calls", async () => {
    usecase.startAgentSessionRetention(90);
    usecase.startAgentSessionRetention(90);

    await vi.advanceTimersByTimeAsync(RUN_INTERVAL_MS);

    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenCalledTimes(2);
  });

  it("allow restarting after stop", async () => {
    usecase.startAgentSessionRetention(90);
    await vi.advanceTimersByTimeAsync(0);
    usecase.stopAgentSessionRetention();

    usecase.startAgentSessionRetention(90);
    await vi.advanceTimersByTimeAsync(0);
    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(RUN_INTERVAL_MS);
    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenCalledTimes(3);
  });

  it("logs failures and keeps the schedule running", async () => {
    (db.deleteAgentSessionsLastActiveBefore as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("boom")
    );
    usecase.startAgentSessionRetention(90);

    await vi.advanceTimersByTimeAsync(0);
    expect(logger.warn).toHaveBeenCalledWith(
      "agent session retention run failed",
      expect.objectContaining({ error: "boom" })
    );

    await vi.advanceTimersByTimeAsync(RUN_INTERVAL_MS);
    expect(db.deleteAgentSessionsLastActiveBefore).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalled();
  });
});