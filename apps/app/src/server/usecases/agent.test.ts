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
  config: {
    configPath: "./config.yaml",
    hermesDocsPath: "./docs",
    pluginIdentifier: "hermeum/hermeum/plugin/hermeum",
    pluginRef: "fe9e5350054cccaf3a38d49b70900d4300b90462",
    pluginEndpointUrl: "http://hermeum:3000/plugin/trpc",
  },
}));

import { stringify } from "yaml";

import { AgentUseCase, MANAGED_SOUL_POSTAMBLE } from "./agent";
import { config } from "@/server/libs/config";
import { hashPluginToken } from "@/server/libs/plugin-token";
import type { Database } from "./adaptors/database";
import type { FileAdaptor } from "./adaptors/file";
import type { Runtime } from "./adaptors/runtime";
import type { JsonPatchOp } from "@/entities";
import type { Agent, AgentInput, AgentPlugin, Context, Env, SharedEnvSet } from "@/entities";
import { ENV_SECRET_SENTINEL } from "@/entities";

const HERMES_PLUGIN: AgentPlugin = {
  identifier: "hermeum/hermeum/plugin/hermeum",
  ref: "fe9e5350054cccaf3a38d49b70900d4300b90462",
};
const USER_PLUGIN: AgentPlugin = { identifier: "owner/some-plugin" };
const PLUGIN_ENV_VAR = {
  name: "HERMEUM_PLUGIN_BASE_URL",
  value: "http://hermeum:3000/plugin/trpc",
};
const PLUGIN_TOKEN_ENV_NAME = "HERMEUM_PLUGIN_TOKEN";

// Matches any generated ingest token (hmt_ + 32 bytes base64url).
const anyTokenValue = expect.stringMatching(/^hmt_[A-Za-z0-9_-]+$/);

// FileAdaptor serving the Hermeum config file the use case inherits loading for.
// Accepts the legacy flat-array shape and the multi-candidate array-of-arrays
// shape; HermeumConfigSchema.parse normalizes to JsonPatchOp[][] at runtime.
type AgentTypeInput = {
  description?: string;
  mutatingWebhookJsonPatch: JsonPatchOp[] | JsonPatchOp[][];
};

function makeConfig(agentTypes?: Record<string, AgentTypeInput>): FileAdaptor {
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

function makeRuntime(): Runtime {
  return {
    listHermesAgents: vi.fn(),
    getHermesAgent: vi.fn(),
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

function makeSharedEnvSet(overrides: Partial<SharedEnvSet> = {}): SharedEnvSet {
  return {
    id: "envset-1",
    userId: "user-1",
    name: "My Env Set",
    envVars: [],
    ...overrides,
  };
}

function makeDatabase(): Database {
  return {
    appendAgentSessionEvents: vi.fn(),
    listAgentSessionSummaries: vi.fn(),
    getAgentSession: vi.fn(),
    storeAgentToken: vi.fn(),
    findAgentIdByTokenHash: vi.fn(),
    revokeAgentToken: vi.fn(),
  };
}

// BaseUseCase order: runtime, files, skillIndex, logger, db — skillIndex and
// logger take the defaults (the telemetry module is mocked at the top), while
// db is stubbed so token persistence never opens a real database.
function makeUseCase(
  runtime: Runtime,
  files: FileAdaptor,
  db: Database = makeDatabase()
): AgentUseCase {
  return new AgentUseCase(runtime, files, undefined, undefined, db);
}

describe("AgentUseCase.getmutatingWebhookJsonPatch", () => {
  it("returns null when agent.type is undefined and no default type is configured", async () => {
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ "some-type": { mutatingWebhookJsonPatch: [] } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: undefined }));
    expect(result).toBeNull();
  });

  it("falls back to the default agent type when agent.type is undefined", async () => {
    const patch: JsonPatchOp[] = [{ op: "add", path: "/a", value: 1 }];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({
        "some-type": { mutatingWebhookJsonPatch: [] },
        default: { mutatingWebhookJsonPatch: patch },
      })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: undefined }));
    expect(result).toEqual(patch);
  });

  it("does not fall back to the default agent type when a set type is unknown", async () => {
    const patch: JsonPatchOp[] = [{ op: "add", path: "/a", value: 1 }];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ default: { mutatingWebhookJsonPatch: patch } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "unknown-type" }));
    expect(result).toBeNull();
  });

  it("evaluates the default type's candidates against the incoming object", async () => {
    const candidates: JsonPatchOp[][] = [
      [
        { op: "test", path: "/spec/model", value: "gpt-4" },
        { op: "add", path: "/a", value: 1 },
      ],
      [{ op: "add", path: "/b", value: 2 }],
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ default: { mutatingWebhookJsonPatch: candidates } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: undefined }), {
      spec: { model: "claude" },
    });
    expect(result).toEqual(candidates[1]);
  });

  it("returns null when config.agentTypes is undefined", async () => {
    const useCase = makeUseCase(makeRuntime(), makeConfig(undefined));
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "some-type" }));
    expect(result).toBeNull();
  });

  it("returns null when the agentType key is missing from config", async () => {
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ "other-type": { mutatingWebhookJsonPatch: [] } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "unknown-type" }));
    expect(result).toBeNull();
  });

  it("returns the patch verbatim, including Handlebars-style placeholders", async () => {
    const patch: JsonPatchOp[] = [
      {
        op: "replace",
        path: "/metadata/annotations/info",
        value:
          "id={{agentId}} user={{userId}} name={{agentName}} desc={{agentDescription}} type={{agentType}}",
      },
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ "my-type": { mutatingWebhookJsonPatch: patch } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(
      makeAgent({
        type: "my-type",
        id: "abc123",
        userId: "usr456",
        name: "My Agent",
        description: "Does things",
      })
    );
    expect(result).toEqual(patch);
    expect(result![0]!.value).toBe(
      "id={{agentId}} user={{userId}} name={{agentName}} desc={{agentDescription}} type={{agentType}}"
    );
  });

  it("passes through ops without a value property unchanged", async () => {
    const patch: JsonPatchOp[] = [{ op: "remove", path: "/metadata/labels/old" }];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: patch } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }));
    expect(result).toEqual(patch);
    expect(result![0]).not.toHaveProperty("value");
  });

  it("passes through nested object/array values without substitution", async () => {
    const patch: JsonPatchOp[] = [
      {
        op: "add",
        path: "/spec/containers/0/env",
        value: [
          { name: "AGENT_ID", value: "{{agentId}}" },
          { name: "USER_ID", value: "{{userId}}" },
        ],
      },
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: patch } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: "t", id: "a1", userId: "u2" })
    );
    expect(result).toEqual(patch);
  });

  it("handles a mixed patch array with and without value in a single call", async () => {
    const patch: JsonPatchOp[] = [
      { op: "remove", path: "/old" },
      { op: "add", path: "/new", value: "{{agentId}}" },
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: patch } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t", id: "zz9" }));
    expect(result).toHaveLength(2);
    expect(result![0]).not.toHaveProperty("value");
    expect(result![1]!.value).toBe("{{agentId}}");
  });

  it("returns all candidates concatenated when no incomingObject is given (backwards compat)", async () => {
    const candidates: JsonPatchOp[][] = [
      [
        { op: "test", path: "/spec/model", value: "x" },
        { op: "add", path: "/a", value: 1 },
      ],
      [{ op: "add", path: "/b", value: 2 }],
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }));
    expect(result).toEqual(candidates.flat());
  });

  it("skips candidates whose test ops fail (non-matching)", async () => {
    const candidates: JsonPatchOp[][] = [
      [
        { op: "test", path: "/spec/model", value: "gpt-4" },
        { op: "add", path: "/a", value: 1 },
      ],
      [
        { op: "test", path: "/spec/model", value: "claude" },
        { op: "add", path: "/b", value: 2 },
      ],
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: { model: "claude" } };
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }), incoming);
    expect(result).toEqual(candidates[1]);
  });

  it("returns an empty patch when no candidate matches (no-op)", async () => {
    const candidates: JsonPatchOp[][] = [
      [
        { op: "test", path: "/spec/model", value: "gpt-4" },
        { op: "add", path: "/a", value: 1 },
      ],
      [
        { op: "test", path: "/spec/model", value: "claude" },
        { op: "add", path: "/b", value: 2 },
      ],
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: { model: "gemini" } };
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }), incoming);
    expect(result).toEqual([]);
  });

  it("matches a candidate with no test ops (unconditional)", async () => {
    const candidates: JsonPatchOp[][] = [
      [
        { op: "test", path: "/spec/model", value: "gpt-4" },
        { op: "add", path: "/a", value: 1 },
      ],
      [{ op: "add", path: "/b", value: 2 }],
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: { model: "anything" } };
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }), incoming);
    expect(result).toEqual(candidates[1]);
  });

  it("combines every matching candidate in declaration order", async () => {
    const candidates: JsonPatchOp[][] = [
      [
        { op: "test", path: "/spec/searxng/enabled", value: true },
        { op: "add", path: "/a", value: 1 },
      ],
      [{ op: "add", path: "/b", value: 2 }],
      [
        { op: "test", path: "/spec/camofox/enabled", value: true },
        { op: "add", path: "/c", value: 3 },
      ],
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: { searxng: { enabled: true }, camofox: { enabled: true } } };
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }), incoming);
    expect(result).toEqual(candidates.flat());
  });

  it("evaluates candidates sequentially against the doc as mutated by earlier matches", async () => {
    // The second candidate's `test` asserts a value that only exists after the
    // first candidate's `add` has been applied to the working copy.
    const candidates: JsonPatchOp[][] = [
      [{ op: "add", path: "/spec/model", value: "claude" }],
      [
        { op: "test", path: "/spec/model", value: "claude" },
        { op: "add", path: "/matched", value: true },
      ],
      [
        { op: "test", path: "/spec/model", value: "gpt-4" },
        { op: "add", path: "/skipped", value: true },
      ],
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }), {
      spec: {},
    });
    expect(result).toEqual([candidates[0], candidates[1]].flat());
  });

  it("skips a candidate whose tests pass but whose mutation ops cannot apply", async () => {
    const candidates: JsonPatchOp[][] = [
      [{ op: "add", path: "/missing-parent/child", value: 1 }],
      [{ op: "add", path: "/valid", value: 2 }],
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }), {});
    expect(result).toEqual(candidates[1]);
  });

  it("does not leak partially-applied candidate ops into later candidates' evaluation", async () => {
    // The second candidate applies `add /a=1` before failing at
    // `add /nosuch/child`. Its committed ghost value must not satisfy the
    // third candidate's `test /a==1` — otherwise the emitted patch would
    // re-assert a test the apiserver cannot satisfy (the second candidate
    // was skipped), rejecting the entire admission patch.
    const candidates: JsonPatchOp[][] = [
      [{ op: "add", path: "/a", value: 1 }],
      [
        { op: "test", path: "/a", value: 1 },
        { op: "add", path: "/b", value: 2 },
        { op: "add", path: "/nosuch/child", value: 3 },
      ],
      [
        { op: "test", path: "/b", value: 2 },
        { op: "add", path: "/leaked", value: 99 },
      ],
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }), {
      spec: {},
    });
    expect(result).toEqual(candidates[0]);
  });

  it("does not mutate the incoming object while combining", async () => {
    const candidates: JsonPatchOp[][] = [[{ op: "add", path: "/spec/model", value: "claude" }]];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: {} };
    await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }), incoming);
    expect(incoming).toEqual({ spec: {} });
  });

  it("preserves test ops in the returned patch for K8s atomic re-assertion", async () => {
    const candidates: JsonPatchOp[][] = [
      [
        { op: "test", path: "/spec/model", value: "gpt-4" },
        { op: "add", path: "/a", value: 1 },
      ],
    ];
    const useCase = makeUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: { model: "gpt-4" } };
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }), incoming);
    expect(result).toEqual(candidates[0]);
    expect(result![0]!.op).toBe("test");
  });
});

describe("AgentUseCase shared env set validation", () => {
  it("createHermesAgent succeeds when a referenced env set belongs to the same user", async () => {
    const runtime = makeRuntime();
    (runtime.getSharedEnvSet as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSharedEnvSet({ id: "envset-1", userId: "user-1" })
    );
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ sharedEnvSets: ["envset-1"] })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { sharedEnvSets: ["envset-1"] })
    ).resolves.toBeDefined();
  });

  it("createHermesAgent succeeds when a referenced env set belongs to another user", async () => {
    const runtime = makeRuntime();
    (runtime.getSharedEnvSet as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSharedEnvSet({ id: "envset-1", userId: "other-user" })
    );
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ sharedEnvSets: ["envset-1"] })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { sharedEnvSets: ["envset-1"] })
    ).resolves.toBeDefined();
  });

  it("createHermesAgent throws when a referenced env set is archived", async () => {
    const runtime = makeRuntime();
    (runtime.getSharedEnvSet as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSharedEnvSet({ id: "envset-1", userId: "user-1", archived: true })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { sharedEnvSets: ["envset-1"] })
    ).rejects.toThrow('Shared env set "envset-1" is archived');
  });

  it("createHermesAgent throws when a referenced env set does not exist", async () => {
    const runtime = makeRuntime();
    (runtime.getSharedEnvSet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = makeUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { sharedEnvSets: ["envset-1"] })
    ).rejects.toThrow('Shared env set "envset-1" not found');
  });

  it("updateHermesAgent succeeds when a referenced env set belongs to another user", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1" })
    );
    (runtime.getSharedEnvSet as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSharedEnvSet({ id: "envset-1", userId: "other-user" })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ sharedEnvSets: ["envset-1"] })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await expect(
      useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", { sharedEnvSets: ["envset-1"] })
    ).resolves.toBeDefined();
  });

  it("updateHermesAgent throws when a referenced env set is archived", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1" })
    );
    (runtime.getSharedEnvSet as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSharedEnvSet({ id: "envset-1", archived: true })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await expect(
      useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", { sharedEnvSets: ["envset-1"] })
    ).rejects.toThrow('Shared env set "envset-1" is archived');
  });
});

describe("AgentUseCase env sensitivity validation", () => {
  it("updateHermesAgent throws when flipping a sensitive env var to non-sensitive", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({
        userId: "user-1",
        env: [{ name: "API_KEY", value: "<secret>", sensitive: true }],
      })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await expect(
      useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
        env: [{ name: "API_KEY", value: "plain", sensitive: false }],
      })
    ).rejects.toThrow('Env var "API_KEY" is sensitive and cannot be marked as non-sensitive');
  });

  it("updateHermesAgent throws when omitting sensitive on a previously sensitive env var", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({
        userId: "user-1",
        env: [{ name: "API_KEY", value: "<secret>", sensitive: true }],
      })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await expect(
      useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
        env: [{ name: "API_KEY", value: "<secret>" }],
      })
    ).rejects.toThrow('Env var "API_KEY" is sensitive and cannot be marked as non-sensitive');
  });

  it("updateHermesAgent allows flipping a non-sensitive env var to sensitive", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1", env: [{ name: "REGION", value: "us-east-1" }] })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ env: [{ name: "REGION", value: "<secret>", sensitive: true }] })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await expect(
      useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
        env: [{ name: "REGION", value: "us-east-1", sensitive: true }],
      })
    ).resolves.toBeDefined();
  });

  it("updateHermesAgent allows adding new env vars and removing existing ones", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({
        userId: "user-1",
        env: [{ name: "API_KEY", value: "<secret>", sensitive: true }],
      })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ env: [{ name: "NEW_VAR", value: "hello" }] })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await expect(
      useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
        env: [{ name: "NEW_VAR", value: "hello" }],
      })
    ).resolves.toBeDefined();
  });
});

describe("AgentUseCase managed soul postamble", () => {
  it("createHermesAgent appends the postamble to a user soul and strips it from the return value", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: { soul?: string }) => makeAgent({ soul: input.soul })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    const agent = await useCase.createHermesAgent(makeCtx("user-1"), {
      soul: "You are helpful.",
    });
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        soul: `You are helpful.\n\n${MANAGED_SOUL_POSTAMBLE}`,
      })
    );
    expect(agent.soul).toBe("You are helpful.");
  });

  it("createHermesAgent sets the postamble alone when no soul is provided", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: { soul?: string }) => makeAgent({ soul: input.soul })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    const agent = await useCase.createHermesAgent(makeCtx("user-1"), {});
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({ soul: MANAGED_SOUL_POSTAMBLE })
    );
    expect(agent.soul).toBeUndefined();
  });

  it("createHermesAgent is idempotent when the input soul already carries the postamble", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: { soul?: string }) => makeAgent({ soul: input.soul })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await useCase.createHermesAgent(makeCtx("user-1"), {
      soul: `You are helpful.\n\n${MANAGED_SOUL_POSTAMBLE}`,
    });
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        soul: `You are helpful.\n\n${MANAGED_SOUL_POSTAMBLE}`,
      })
    );
  });

  it("updateHermesAgent injects the postamble into a soul-carrying patch and strips the return value", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1" })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ patch }: { patch: { soul?: string } }) => makeAgent({ soul: patch.soul })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    const agent = await useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
      soul: "You are helpful.",
    });
    expect(runtime.patchHermesAgent).toHaveBeenCalledWith({
      id: "agent-1",
      patch: expect.objectContaining({
        soul: `You are helpful.\n\n${MANAGED_SOUL_POSTAMBLE}`,
      }),
    });
    expect(agent.soul).toBe("You are helpful.");
  });

  it("updateHermesAgent leaves patches without a soul untouched (gradual migration)", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1" })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ name: "Renamed" })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", { name: "Renamed" });
    expect(runtime.patchHermesAgent).toHaveBeenCalledWith({
      id: "agent-1",
      patch: { name: "Renamed" },
    });
  });

  it("strips the postamble on reads: getHermesAgent, listHermesAgents, and suspension returns", async () => {
    const storedSoul = `User soul.\n\n${MANAGED_SOUL_POSTAMBLE}`;
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ soul: storedSoul })
    );
    (runtime.listHermesAgents as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeAgent({ soul: storedSoul }),
    ]);
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ soul: storedSoul })
    );
    (runtime.archiveHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ soul: storedSoul })
    );
    const useCase = makeUseCase(runtime, makeConfig());
    const ctx = makeCtx("user-1");

    expect((await useCase.getHermesAgent(ctx, "agent-1"))?.soul).toBe("User soul.");
    expect((await useCase.listHermesAgents(ctx))[0]?.soul).toBe("User soul.");
    expect((await useCase.suspendHermesAgent(ctx, "agent-1")).soul).toBe("User soul.");
    expect((await useCase.resumeHermesAgent(ctx, "agent-1")).soul).toBe("User soul.");
    expect((await useCase.archiveHermesAgent(ctx, "agent-1")).soul).toBe("User soul.");
  });

  it("maps a postamble-only stored soul back to undefined", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ soul: MANAGED_SOUL_POSTAMBLE })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    expect((await useCase.getHermesAgent(makeCtx("user-1"), "agent-1"))?.soul).toBeUndefined();
  });

  it("passes stored souls without the postamble through unchanged (pre-postamble agents)", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ soul: "Legacy soul that mentions config.yaml." })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    expect((await useCase.getHermesAgent(makeCtx("user-1"), "agent-1"))?.soul).toBe(
      "Legacy soul that mentions config.yaml."
    );
  });

  it("passes legacy front-position stored souls through unchanged (pre-flip agents)", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ soul: `${MANAGED_SOUL_POSTAMBLE}\n\nUser soul.` })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    expect((await useCase.getHermesAgent(makeCtx("user-1"), "agent-1"))?.soul).toBe(
      `${MANAGED_SOUL_POSTAMBLE}\n\nUser soul.`
    );
  });
});

describe("AgentUseCase managed hermeum plugin", () => {
  it("createHermesAgent injects the plugin identifier, endpoint var and ingest token", async () => {
    const runtime = makeRuntime();
    const db = makeDatabase();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: AgentInput) => makeAgent({ plugins: input.plugins, env: input.env })
    );
    const useCase = makeUseCase(runtime, makeConfig(), db);

    const agent = await useCase.createHermesAgent(makeCtx("user-1"), {});
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: [HERMES_PLUGIN],
        env: [
          { name: PLUGIN_TOKEN_ENV_NAME, value: anyTokenValue, sensitive: true },
          PLUGIN_ENV_VAR,
        ],
      })
    );
    // The persisted digest matches the raw token injected into the env.
    const created = (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as AgentInput;
    const token = created.env?.find((v) => v.name === PLUGIN_TOKEN_ENV_NAME)?.value;
    expect(db.storeAgentToken).toHaveBeenCalledWith("agent-1", hashPluginToken(token!));
    expect(agent.plugins).toEqual([]);
    expect(agent.env).toEqual([]);
  });

  it("createHermesAgent preserves user plugins and appends the managed one", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: AgentInput) => makeAgent({ plugins: input.plugins })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await useCase.createHermesAgent(makeCtx("user-1"), {
      plugins: [USER_PLUGIN],
    });
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: [USER_PLUGIN, HERMES_PLUGIN],
      })
    );
  });

  it("createHermesAgent is idempotent when the input already lists the managed plugin", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: AgentInput) => makeAgent({ plugins: input.plugins })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await useCase.createHermesAgent(makeCtx("user-1"), {
      plugins: [USER_PLUGIN, HERMES_PLUGIN],
    });
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: [USER_PLUGIN, HERMES_PLUGIN],
      })
    );
  });

  it("createHermesAgent drops a user-supplied managed plugin entry without a ref", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: AgentInput) => makeAgent({ plugins: input.plugins })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await useCase.createHermesAgent(makeCtx("user-1"), {
      plugins: [{ identifier: HERMES_PLUGIN.identifier }],
    });
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: [HERMES_PLUGIN],
      })
    );
  });

  it("createHermesAgent force-overrides a user-pinned managed plugin ref", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: AgentInput) => makeAgent({ plugins: input.plugins })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await useCase.createHermesAgent(makeCtx("user-1"), {
      plugins: [{ identifier: HERMES_PLUGIN.identifier, ref: "0".repeat(40) }],
    });
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: [HERMES_PLUGIN],
      })
    );
  });

  it("createHermesAgent installs the managed plugin without a ref when pluginRef is unset", async () => {
    const originalRef = config.pluginRef;
    config.pluginRef = undefined;
    try {
      const runtime = makeRuntime();
      (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
        async (input: AgentInput) => makeAgent({ plugins: input.plugins })
      );
      const useCase = makeUseCase(runtime, makeConfig());

      await useCase.createHermesAgent(makeCtx("user-1"), {
        plugins: [USER_PLUGIN],
      });
      expect(runtime.createHermesAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          plugins: [USER_PLUGIN, { identifier: HERMES_PLUGIN.identifier }],
        })
      );
    } finally {
      config.pluginRef = originalRef;
    }
  });

  it("createHermesAgent force-overrides a user-supplied endpoint env var", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: AgentInput) => makeAgent({ env: input.env })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await useCase.createHermesAgent(makeCtx("user-1"), {
      env: [{ name: "HERMEUM_PLUGIN_BASE_URL", value: "http://evil.example.com" }],
    });
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        env: [
          { name: PLUGIN_TOKEN_ENV_NAME, value: anyTokenValue, sensitive: true },
          PLUGIN_ENV_VAR,
        ],
      })
    );
  });

  it("createHermesAgent force-overrides a user-supplied ingest token", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: AgentInput) => makeAgent({ env: input.env })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await useCase.createHermesAgent(makeCtx("user-1"), {
      env: [{ name: PLUGIN_TOKEN_ENV_NAME, value: "hmt_forged" }],
    });
    const created = (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as AgentInput;
    const token = created.env?.find((v) => v.name === PLUGIN_TOKEN_ENV_NAME)?.value;
    // Not the user's value, and marked sensitive.
    expect(token).not.toBe("hmt_forged");
    expect(created.env).toEqual([
      { name: PLUGIN_TOKEN_ENV_NAME, value: token, sensitive: true },
      PLUGIN_ENV_VAR,
    ]);
  });

  it("updateHermesAgent injects into carrying patches only", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1" })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ patch }: { patch: AgentInput }) =>
        makeAgent({ plugins: patch.plugins, env: patch.env })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    const withPlugins = await useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
      plugins: [USER_PLUGIN],
    });
    expect(runtime.patchHermesAgent).toHaveBeenCalledWith({
      id: "agent-1",
      patch: expect.objectContaining({
        plugins: [USER_PLUGIN, HERMES_PLUGIN],
      }),
    });
    expect(withPlugins.plugins).toEqual([USER_PLUGIN]);

    const withEnv = await useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
      env: [{ name: "NEW_VAR", value: "hello" }],
    });
    expect(runtime.patchHermesAgent).toHaveBeenLastCalledWith({
      id: "agent-1",
      patch: expect.objectContaining({
        env: [{ name: "NEW_VAR", value: "hello" }, PLUGIN_ENV_VAR],
      }),
    });
    expect(withEnv.env?.filter((v) => v.name !== PLUGIN_ENV_VAR.name)).toEqual([
      { name: "NEW_VAR", value: "hello" },
    ]);

    await useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", { name: "Renamed" });
    expect(runtime.patchHermesAgent).toHaveBeenLastCalledWith({
      id: "agent-1",
      patch: { name: "Renamed" },
    });
  });

  // Deliberate: no backfill migration for pre-pipeline agents. Before the
  // plugin moved from CR container env to agent .env (this PR), the endpoint
  // var never shipped in a release (plugin install landed in #268, after
  // v0.2.1) — the only exposure is dev builds, where the plugin falls back to
  // its default URL until the next env-carrying edit. Pinning keeps that
  // decision visible instead of drift.
  it("does not backfill the endpoint var for agents predating the pipeline", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1", env: [{ name: "OLD_VAR", value: "1" }] })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ name: "Renamed" })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", { name: "Renamed" });
    expect(runtime.patchHermesAgent).toHaveBeenCalledWith({
      id: "agent-1",
      patch: { name: "Renamed" },
    });
  });

  // Same pinned decision for the ingest token: pre-pipeline agents have no
  // token and gain none on later edits — their ingest stays unauthorized
  // (fail-closed) until the agent is re-created.
  it("does not backfill the ingest token for agents predating the pipeline", async () => {
    const runtime = makeRuntime();
    const db = makeDatabase();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1", env: [{ name: "OLD_VAR", value: "1" }] })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ patch }: { patch: AgentInput }) => makeAgent({ env: patch.env })
    );
    const useCase = makeUseCase(runtime, makeConfig(), db);

    await useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
      env: [{ name: "OLD_VAR", value: "1" }],
    });
    const patch = (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      patch: AgentInput;
    };
    expect(patch.patch.env?.some((v) => v.name === PLUGIN_TOKEN_ENV_NAME)).toBe(false);
    expect(db.storeAgentToken).not.toHaveBeenCalled();
  });

  it("updateHermesAgent preserves the ingest token across env patches (sentinel round-trip)", async () => {
    const runtime = makeRuntime();
    const db = makeDatabase();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({
        userId: "user-1",
        env: [
          { name: "OLD_VAR", value: "1" },
          { name: PLUGIN_TOKEN_ENV_NAME, value: ENV_SECRET_SENTINEL, sensitive: true },
        ],
      })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ patch }: { patch: AgentInput }) => makeAgent({ env: patch.env })
    );
    const useCase = makeUseCase(runtime, makeConfig(), db);

    await useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
      env: [{ name: "NEW_VAR", value: "hello" }],
    });
    // The masked entry rides the patch verbatim; the raw value never
    // surfaces at the use-case layer, and the digest is never re-stored.
    expect(runtime.patchHermesAgent).toHaveBeenCalledWith({
      id: "agent-1",
      patch: expect.objectContaining({
        env: [
          { name: "NEW_VAR", value: "hello" },
          { name: PLUGIN_TOKEN_ENV_NAME, value: ENV_SECRET_SENTINEL, sensitive: true },
          PLUGIN_ENV_VAR,
        ],
      }),
    });
    expect(db.storeAgentToken).not.toHaveBeenCalled();
  });

  it("updateHermesAgent drops a user-supplied ingest token from env patches", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1", env: [{ name: "OLD_VAR", value: "1" }] })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ patch }: { patch: AgentInput }) => makeAgent({ env: patch.env })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    await useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
      env: [{ name: PLUGIN_TOKEN_ENV_NAME, value: "hmt_forged" }],
    });
    const patch = (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      patch: AgentInput;
    };
    expect(patch.patch.env?.some((v) => v.name === PLUGIN_TOKEN_ENV_NAME)).toBe(false);
  });

  it("strips the managed plugin, endpoint var and ingest token from every read direction", async () => {
    const storedPlugins: AgentPlugin[] = [USER_PLUGIN, HERMES_PLUGIN];
    const storedEnv: Env = [
      { name: "NEW_VAR", value: "hello" },
      PLUGIN_ENV_VAR,
      { name: PLUGIN_TOKEN_ENV_NAME, value: "hmt_stored", sensitive: true },
    ];
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ plugins: storedPlugins, env: storedEnv })
    );
    (runtime.listHermesAgents as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeAgent({ plugins: storedPlugins, env: storedEnv }),
    ]);
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ plugins: storedPlugins, env: storedEnv })
    );
    (runtime.archiveHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ plugins: storedPlugins, env: storedEnv })
    );
    const useCase = makeUseCase(runtime, makeConfig());
    const ctx = makeCtx("user-1");

    for (const result of [
      await useCase.getHermesAgent(ctx, "agent-1"),
      (await useCase.listHermesAgents(ctx))[0],
      await useCase.suspendHermesAgent(ctx, "agent-1"),
      await useCase.resumeHermesAgent(ctx, "agent-1"),
      await useCase.archiveHermesAgent(ctx, "agent-1"),
      await useCase.updateHermesAgent(ctx, "agent-1", { name: "Renamed" }),
    ]) {
      expect(result?.plugins).toEqual([USER_PLUGIN]);
      expect(result?.env).toEqual([{ name: "NEW_VAR", value: "hello" }]);
    }
  });

  it("leaves agents without the managed content untouched", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ plugins: [USER_PLUGIN], env: [{ name: "V", value: "1" }] })
    );
    const useCase = makeUseCase(runtime, makeConfig());

    const agent = await useCase.getHermesAgent(makeCtx("user-1"), "agent-1");
    expect(agent?.plugins).toEqual([USER_PLUGIN]);
    expect(agent?.env).toEqual([{ name: "V", value: "1" }]);
  });

  it("archiveHermesAgent revokes the ingest token after archiving", async () => {
    const runtime = makeRuntime();
    const db = makeDatabase();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1" })
    );
    (runtime.archiveHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ archived: true })
    );
    const useCase = makeUseCase(runtime, makeConfig(), db);

    await useCase.archiveHermesAgent(makeCtx("user-1"), "agent-1");
    expect(db.revokeAgentToken).toHaveBeenCalledWith("agent-1");
  });
});
