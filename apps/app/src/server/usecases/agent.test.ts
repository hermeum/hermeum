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

import { stringify } from "yaml";

import { AgentUseCase, MANAGED_SOUL_PREAMBLE } from "./agent";
import type { FileAdaptor } from "./adaptors/file";
import type { Runtime } from "./adaptors/runtime";
import type { JsonPatchOp } from "@/entities";
import type { Agent, Context, SharedEnvSet } from "@/entities";

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

describe("AgentUseCase.getmutatingWebhookJsonPatch", () => {
  it("returns null when agent.type is undefined and no default type is configured", async () => {
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ "some-type": { mutatingWebhookJsonPatch: [] } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: undefined }));
    expect(result).toBeNull();
  });

  it("falls back to the default agent type when agent.type is undefined", async () => {
    const patch: JsonPatchOp[] = [{ op: "add", path: "/a", value: 1 }];
    const useCase = new AgentUseCase(
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
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ default: { mutatingWebhookJsonPatch: patch } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "unknown-type" }));
    expect(result).toBeNull();
  });

  it("evaluates the default type's candidates against the incoming object", async () => {
    const candidates: JsonPatchOp[][] = [
      [{ op: "test", path: "/spec/model", value: "gpt-4" }, { op: "add", path: "/a", value: 1 }],
      [{ op: "add", path: "/b", value: 2 }],
    ];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ default: { mutatingWebhookJsonPatch: candidates } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: undefined }),
      { spec: { model: "claude" } },
    );
    expect(result).toEqual(candidates[1]);
  });

  it("returns null when config.agentTypes is undefined", async () => {
    const useCase = new AgentUseCase(makeRuntime(), makeConfig(undefined));
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "some-type" }));
    expect(result).toBeNull();
  });

  it("returns null when the agentType key is missing from config", async () => {
    const useCase = new AgentUseCase(
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
    const useCase = new AgentUseCase(
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
    const useCase = new AgentUseCase(
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
    const useCase = new AgentUseCase(
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
    const useCase = new AgentUseCase(
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
      [{ op: "test", path: "/spec/model", value: "x" }, { op: "add", path: "/a", value: 1 }],
      [{ op: "add", path: "/b", value: 2 }],
    ];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }));
    expect(result).toEqual(candidates.flat());
  });

  it("skips candidates whose test ops fail (non-matching)", async () => {
    const candidates: JsonPatchOp[][] = [
      [{ op: "test", path: "/spec/model", value: "gpt-4" }, { op: "add", path: "/a", value: 1 }],
      [{ op: "test", path: "/spec/model", value: "claude" }, { op: "add", path: "/b", value: 2 }],
    ];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: { model: "claude" } };
    const result = await useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: "t" }),
      incoming,
    );
    expect(result).toEqual(candidates[1]);
  });

  it("returns an empty patch when no candidate matches (no-op)", async () => {
    const candidates: JsonPatchOp[][] = [
      [{ op: "test", path: "/spec/model", value: "gpt-4" }, { op: "add", path: "/a", value: 1 }],
      [{ op: "test", path: "/spec/model", value: "claude" }, { op: "add", path: "/b", value: 2 }],
    ];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: { model: "gemini" } };
    const result = await useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: "t" }),
      incoming,
    );
    expect(result).toEqual([]);
  });

  it("matches a candidate with no test ops (unconditional)", async () => {
    const candidates: JsonPatchOp[][] = [
      [{ op: "test", path: "/spec/model", value: "gpt-4" }, { op: "add", path: "/a", value: 1 }],
      [{ op: "add", path: "/b", value: 2 }],
    ];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: { model: "anything" } };
    const result = await useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: "t" }),
      incoming,
    );
    expect(result).toEqual(candidates[1]);
  });

  it("combines every matching candidate in declaration order", async () => {
    const candidates: JsonPatchOp[][] = [
      [{ op: "test", path: "/spec/searxng/enabled", value: true }, { op: "add", path: "/a", value: 1 }],
      [{ op: "add", path: "/b", value: 2 }],
      [{ op: "test", path: "/spec/camofox/enabled", value: true }, { op: "add", path: "/c", value: 3 }],
    ];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: { searxng: { enabled: true }, camofox: { enabled: true } } };
    const result = await useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: "t" }),
      incoming,
    );
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
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: "t" }),
      { spec: {} },
    );
    expect(result).toEqual([candidates[0], candidates[1]].flat());
  });

  it("skips a candidate whose tests pass but whose mutation ops cannot apply", async () => {
    const candidates: JsonPatchOp[][] = [
      [{ op: "add", path: "/missing-parent/child", value: 1 }],
      [{ op: "add", path: "/valid", value: 2 }],
    ];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: "t" }),
      {},
    );
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
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const result = await useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: "t" }),
      { spec: {} },
    );
    expect(result).toEqual(candidates[0]);
  });

  it("does not mutate the incoming object while combining", async () => {
    const candidates: JsonPatchOp[][] = [
      [{ op: "add", path: "/spec/model", value: "claude" }],
    ];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: {} };
    await useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }), incoming);
    expect(incoming).toEqual({ spec: {} });
  });

  it("preserves test ops in the returned patch for K8s atomic re-assertion", async () => {
    const candidates: JsonPatchOp[][] = [
      [{ op: "test", path: "/spec/model", value: "gpt-4" }, { op: "add", path: "/a", value: 1 }],
    ];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: candidates } })
    );
    const incoming = { spec: { model: "gpt-4" } };
    const result = await useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: "t" }),
      incoming,
    );
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
    const useCase = new AgentUseCase(runtime, makeConfig());

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
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { sharedEnvSets: ["envset-1"] })
    ).resolves.toBeDefined();
  });

  it("createHermesAgent throws when a referenced env set is archived", async () => {
    const runtime = makeRuntime();
    (runtime.getSharedEnvSet as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSharedEnvSet({ id: "envset-1", userId: "user-1", archived: true })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { sharedEnvSets: ["envset-1"] })
    ).rejects.toThrow('Shared env set "envset-1" is archived');
  });

  it("createHermesAgent throws when a referenced env set does not exist", async () => {
    const runtime = makeRuntime();
    (runtime.getSharedEnvSet as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new AgentUseCase(runtime, makeConfig());

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
    const useCase = new AgentUseCase(runtime, makeConfig());

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
    const useCase = new AgentUseCase(runtime, makeConfig());

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
    const useCase = new AgentUseCase(runtime, makeConfig());

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
    const useCase = new AgentUseCase(runtime, makeConfig());

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
    const useCase = new AgentUseCase(runtime, makeConfig());

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
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
        env: [{ name: "NEW_VAR", value: "hello" }],
      })
    ).resolves.toBeDefined();
  });
});

describe("AgentUseCase managed soul preamble", () => {
  it("createHermesAgent prepends the preamble to a user soul and strips it from the return value", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: { soul?: string }) => makeAgent({ soul: input.soul })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    const agent = await useCase.createHermesAgent(makeCtx("user-1"), {
      soul: "You are helpful.",
    });
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        soul: `${MANAGED_SOUL_PREAMBLE}\n\nYou are helpful.`,
      })
    );
    expect(agent.soul).toBe("You are helpful.");
  });

  it("createHermesAgent sets the preamble alone when no soul is provided", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: { soul?: string }) => makeAgent({ soul: input.soul })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    const agent = await useCase.createHermesAgent(makeCtx("user-1"), {});
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({ soul: MANAGED_SOUL_PREAMBLE })
    );
    expect(agent.soul).toBeUndefined();
  });

  it("createHermesAgent is idempotent when the input soul already carries the preamble", async () => {
    const runtime = makeRuntime();
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: { soul?: string }) => makeAgent({ soul: input.soul })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    await useCase.createHermesAgent(makeCtx("user-1"), {
      soul: `${MANAGED_SOUL_PREAMBLE}\n\nYou are helpful.`,
    });
    expect(runtime.createHermesAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        soul: `${MANAGED_SOUL_PREAMBLE}\n\nYou are helpful.`,
      })
    );
  });

  it("updateHermesAgent injects the preamble into a soul-carrying patch and strips the return value", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1" })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ patch }: { patch: { soul?: string } }) => makeAgent({ soul: patch.soul })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    const agent = await useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", {
      soul: "You are helpful.",
    });
    expect(runtime.patchHermesAgent).toHaveBeenCalledWith({
      id: "agent-1",
      patch: expect.objectContaining({
        soul: `${MANAGED_SOUL_PREAMBLE}\n\nYou are helpful.`,
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
    const useCase = new AgentUseCase(runtime, makeConfig());

    await useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", { name: "Renamed" });
    expect(runtime.patchHermesAgent).toHaveBeenCalledWith({
      id: "agent-1",
      patch: { name: "Renamed" },
    });
  });

  it("strips the preamble on reads: getHermesAgent, listHermesAgents, and suspension returns", async () => {
    const storedSoul = `${MANAGED_SOUL_PREAMBLE}\n\nUser soul.`;
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
    const useCase = new AgentUseCase(runtime, makeConfig());
    const ctx = makeCtx("user-1");

    expect((await useCase.getHermesAgent(ctx, "agent-1"))?.soul).toBe("User soul.");
    expect((await useCase.listHermesAgents(ctx))[0]?.soul).toBe("User soul.");
    expect((await useCase.suspendHermesAgent(ctx, "agent-1")).soul).toBe("User soul.");
    expect((await useCase.resumeHermesAgent(ctx, "agent-1")).soul).toBe("User soul.");
    expect((await useCase.archiveHermesAgent(ctx, "agent-1")).soul).toBe("User soul.");
  });

  it("maps a preamble-only stored soul back to undefined", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ soul: MANAGED_SOUL_PREAMBLE })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    expect((await useCase.getHermesAgent(makeCtx("user-1"), "agent-1"))?.soul).toBeUndefined();
  });

  it("passes stored souls without the preamble through unchanged (pre-preamble agents)", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ soul: "Legacy soul that mentions config.yaml." })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    expect(
      (await useCase.getHermesAgent(makeCtx("user-1"), "agent-1"))?.soul
    ).toBe("Legacy soul that mentions config.yaml.");
  });
});
