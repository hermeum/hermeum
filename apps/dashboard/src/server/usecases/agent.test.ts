import { describe, it, expect, vi } from "vitest";

vi.mock("../infras/kubernetes/client", () => ({ KubernetesClient: vi.fn() }));
vi.mock("../infras/local-agent-config", () => ({ LocalConfig: vi.fn() }));

import { AgentUseCase } from "./agent";
import type { ConfigAdaptor } from "./adaptors/config";
import type { Runtime } from "./adaptors/runtime";
import type { AgentConfig, JsonPatchOp } from "@/entities";
import type { Agent, Context, Secret } from "@/entities";

function makeConfig(agentTypes?: AgentConfig["agentTypes"]): ConfigAdaptor {
  return {
    get: vi.fn().mockReturnValue({
      agentTypes,
      templates: [],
    } satisfies AgentConfig),
  };
}

function makeRuntime(): Runtime {
  return {
    listHermesAgents: vi.fn(),
    getHermesAgent: vi.fn(),
    createHermesAgent: vi.fn(),
    patchHermesAgent: vi.fn(),
    archiveHermesAgent: vi.fn(),
    listSecrets: vi.fn(),
    getSecret: vi.fn(),
    createSecret: vi.fn(),
    archiveSecret: vi.fn(),
    patchSecret: vi.fn(),
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

function makeSecret(overrides: Partial<Secret> = {}): Secret {
  return {
    id: "secret-1",
    userId: "user-1",
    name: "My Secret",
    envVars: [],
    ...overrides,
  };
}

describe("AgentUseCase.getmutatingWebhookJsonPatch", () => {
  it("returns null when agent.type is undefined", () => {
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ "some-type": { mutatingWebhookJsonPatch: [] } })
    );
    const result = useCase.getmutatingWebhookJsonPatch(makeAgent({ type: undefined }));
    expect(result).toBeNull();
  });

  it("returns null when config.agentTypes is undefined", () => {
    const useCase = new AgentUseCase(makeRuntime(), makeConfig(undefined));
    const result = useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "some-type" }));
    expect(result).toBeNull();
  });

  it("returns null when the agentType key is missing from config", () => {
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ "other-type": { mutatingWebhookJsonPatch: [] } })
    );
    const result = useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "unknown-type" }));
    expect(result).toBeNull();
  });

  it("returns the patch unchanged when no Handlebars variables are present", () => {
    const patch: JsonPatchOp[] = [{ op: "add", path: "/metadata/labels/env", value: "production" }];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ "my-type": { mutatingWebhookJsonPatch: patch } })
    );
    const result = useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "my-type" }));
    expect(result).toEqual(patch);
  });

  it("substitutes all five variables in a string value", () => {
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
    const result = useCase.getmutatingWebhookJsonPatch(
      makeAgent({
        type: "my-type",
        id: "abc123",
        userId: "usr456",
        name: "My Agent",
        description: "Does things",
      })
    );
    expect(result![0]!.value).toBe(
      "id=abc123 user=usr456 name=My Agent desc=Does things type=my-type"
    );
  });

  it("defaults agentName and agentDescription to empty string when undefined on agent", () => {
    const patch: JsonPatchOp[] = [
      { op: "add", path: "/x", value: "name={{agentName}};desc={{agentDescription}}" },
    ];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: patch } })
    );
    const result = useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: "t", name: undefined, description: undefined })
    );
    expect(result![0]!.value).toBe("name=;desc=");
  });

  it("passes through ops without a value property unchanged", () => {
    const patch: JsonPatchOp[] = [{ op: "remove", path: "/metadata/labels/old" }];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: patch } })
    );
    const result = useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t" }));
    expect(result).toEqual(patch);
    expect(result![0]).not.toHaveProperty("value");
  });

  it("substitutes variables inside a nested object/array value", () => {
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
    const result = useCase.getmutatingWebhookJsonPatch(
      makeAgent({ type: "t", id: "a1", userId: "u2" })
    );
    expect(result![0]!.value).toEqual([
      { name: "AGENT_ID", value: "a1" },
      { name: "USER_ID", value: "u2" },
    ]);
  });

  it("handles a mixed patch array with and without value in a single call", () => {
    const patch: JsonPatchOp[] = [
      { op: "remove", path: "/old" },
      { op: "add", path: "/new", value: "{{agentId}}" },
    ];
    const useCase = new AgentUseCase(
      makeRuntime(),
      makeConfig({ t: { mutatingWebhookJsonPatch: patch } })
    );
    const result = useCase.getmutatingWebhookJsonPatch(makeAgent({ type: "t", id: "zz9" }));
    expect(result).toHaveLength(2);
    expect(result![0]).not.toHaveProperty("value");
    expect(result![1]!.value).toBe("zz9");
  });
});

describe("AgentUseCase secret ownership validation", () => {
  it("createHermesAgent throws when a referenced secret belongs to another user", async () => {
    const runtime = makeRuntime();
    (runtime.getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSecret({ id: "secret-1", userId: "other-user" })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { secrets: ["secret-1"] })
    ).rejects.toThrow('Secret "secret-1" not found');
  });

  it("createHermesAgent succeeds when a referenced secret belongs to the same user", async () => {
    const runtime = makeRuntime();
    (runtime.getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSecret({ id: "secret-1", userId: "user-1" })
    );
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ secrets: ["secret-1"] })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { secrets: ["secret-1"] })
    ).resolves.toBeDefined();
  });

  it("createHermesAgent throws when a referenced secret is archived", async () => {
    const runtime = makeRuntime();
    (runtime.getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSecret({ id: "secret-1", userId: "user-1", archived: true })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { secrets: ["secret-1"] })
    ).rejects.toThrow('Secret "secret-1" is archived');
  });

  it("createHermesAgent throws when a referenced secret does not exist", async () => {
    const runtime = makeRuntime();
    (runtime.getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { secrets: ["secret-1"] })
    ).rejects.toThrow('Secret "secret-1" not found');
  });

  it("updateHermesAgent throws when a referenced secret belongs to another user", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1" })
    );
    (runtime.getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSecret({ id: "secret-1", userId: "other-user" })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", { secrets: ["secret-1"] })
    ).rejects.toThrow('Secret "secret-1" not found');
  });

  it("updateHermesAgent succeeds when a referenced secret belongs to the same user", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1" })
    );
    (runtime.getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSecret({ id: "secret-1", userId: "user-1" })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ secrets: ["secret-1"] })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", { secrets: ["secret-1"] })
    ).resolves.toBeDefined();
  });

  it("createHermesAgent succeeds when a referenced secret belongs to another user but is shared", async () => {
    const runtime = makeRuntime();
    (runtime.getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSecret({ id: "secret-1", userId: "other-user", shared: true })
    );
    (runtime.createHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ secrets: ["secret-1"] })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { secrets: ["secret-1"] })
    ).resolves.toBeDefined();
  });

  it("createHermesAgent throws when a referenced shared secret is archived", async () => {
    const runtime = makeRuntime();
    (runtime.getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSecret({ id: "secret-1", userId: "other-user", shared: true, archived: true })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.createHermesAgent(makeCtx("user-1"), { secrets: ["secret-1"] })
    ).rejects.toThrow('Secret "secret-1" is archived');
  });

  it("updateHermesAgent succeeds when a referenced secret belongs to another user but is shared", async () => {
    const runtime = makeRuntime();
    (runtime.getHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ userId: "user-1" })
    );
    (runtime.getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSecret({ id: "secret-1", userId: "other-user", shared: true })
    );
    (runtime.patchHermesAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ secrets: ["secret-1"] })
    );
    const useCase = new AgentUseCase(runtime, makeConfig());

    await expect(
      useCase.updateHermesAgent(makeCtx("user-1"), "agent-1", { secrets: ["secret-1"] })
    ).resolves.toBeDefined();
  });
});
