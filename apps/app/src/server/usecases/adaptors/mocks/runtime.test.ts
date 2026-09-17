import { describe, it, expect } from "vitest";

import { ENV_SECRET_SENTINEL } from "@/entities";

import { MockRuntime } from "./runtime";

function makeAgentInput(userId = "user-1") {
  return {
    userId,
    name: "Test Agent",
    description: "An agent for tests",
    env: [
      { name: "PLAIN", value: "hello" },
      { name: "SECRET", value: "s3cr3t", sensitive: true },
    ],
  };
}

describe("MockRuntime agents", () => {
  it("creates an agent with a generated id, Running phase, and masked sensitive env", async () => {
    const runtime = new MockRuntime();
    const agent = await runtime.createHermesAgent(makeAgentInput());

    expect(agent.id).toMatch(/^agent-/);
    expect(agent.userId).toBe("user-1");
    expect(agent.name).toBe("Test Agent");
    expect(agent.phase).toBe("Running");
    expect(agent.createdAt).toBeInstanceOf(Date);
    expect(agent.env).toEqual([
      { name: "PLAIN", value: "hello" },
      { name: "SECRET", value: ENV_SECRET_SENTINEL, sensitive: true },
    ]);
  });

  it("gets a created agent and returns null for a missing one", async () => {
    const runtime = new MockRuntime();
    const created = await runtime.createHermesAgent(makeAgentInput());

    const fetched = await runtime.getHermesAgent(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(await runtime.getHermesAgent("agent-nope")).toBeNull();
  });

  it("lists agents and honors the archived filter", async () => {
    const runtime = new MockRuntime();
    const a = await runtime.createHermesAgent(makeAgentInput());
    const b = await runtime.createHermesAgent(makeAgentInput());
    await runtime.archiveHermesAgent(b.id);

    const all = await runtime.listHermesAgents();
    expect(all.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());

    const active = await runtime.listHermesAgents({ archived: false });
    expect(active.map((x) => x.id)).toEqual([a.id]);
    expect(active[0]?.archived).toBe(false);
    expect(active[0]?.suspended).toBeUndefined();

    const archivedAgents = await runtime.listHermesAgents({ archived: true });
    expect(archivedAgents.map((x) => x.id)).toEqual([b.id]);
    expect(archivedAgents[0]?.archived).toBe(true);
    expect(archivedAgents[0]?.suspended).toBe(true);
  });

  it("patches non-env fields without touching env", async () => {
    const runtime = new MockRuntime();
    const created = await runtime.createHermesAgent(makeAgentInput());

    const patched = await runtime.patchHermesAgent({ id: created.id, patch: { name: "Renamed" } });
    expect(patched.name).toBe("Renamed");
    expect(patched.env).toEqual([
      { name: "PLAIN", value: "hello" },
      { name: "SECRET", value: ENV_SECRET_SENTINEL, sensitive: true },
    ]);
  });

  it("preserves the stored sensitive value when the sentinel round-trips through a patch", async () => {
    const runtime = new MockRuntime();
    const created = await runtime.createHermesAgent(makeAgentInput());

    const patched = await runtime.patchHermesAgent({
      id: created.id,
      patch: {
        env: [
          { name: "PLAIN", value: "updated" },
          { name: "SECRET", value: ENV_SECRET_SENTINEL, sensitive: true },
        ],
      },
    });
    expect(patched.env).toEqual([
      { name: "PLAIN", value: "updated" },
      { name: "SECRET", value: ENV_SECRET_SENTINEL, sensitive: true },
    ]);

    // The real value survives internally — a fresh patch can still resolve it.
    const repatched = await runtime.patchHermesAgent({
      id: created.id,
      patch: { env: [{ name: "SECRET", value: ENV_SECRET_SENTINEL, sensitive: true }] },
    });
    expect(repatched.env).toEqual([{ name: "SECRET", value: ENV_SECRET_SENTINEL, sensitive: true }]);
  });

  it("throws when patching a sentinel-sensitive var with no stored value", async () => {
    const runtime = new MockRuntime();
    const created = await runtime.createHermesAgent({
      userId: "user-1",
      env: [{ name: "OTHER", value: "x" }],
    });

    await expect(
      runtime.patchHermesAgent({
        id: created.id,
        patch: { env: [{ name: "NEW_SECRET", value: ENV_SECRET_SENTINEL, sensitive: true }] },
      })
    ).rejects.toThrow(/no existing secret value found/);
  });

  it("throws when patching or archiving a missing agent", async () => {
    const runtime = new MockRuntime();
    await expect(
      runtime.patchHermesAgent({ id: "agent-nope", patch: { name: "X" } })
    ).rejects.toThrow(/not found/);
    await expect(runtime.archiveHermesAgent("agent-nope")).rejects.toThrow(/not found/);
  });

  it("surveys fake endpoints only for enabled platforms", async () => {
    const runtime = new MockRuntime();
    const disabled = await runtime.createHermesAgent({ userId: "user-1" });
    expect(disabled.endpoints).toEqual({
      "api-server": null,
      webhook: null,
      teams: null,
    });

    const enabled = await runtime.createHermesAgent({
      userId: "user-1",
      env: [
        { name: "API_SERVER_ENABLED", value: "true" },
        { name: "WEBHOOK_ENABLED", value: "true" },
      ],
    });
    expect(enabled.endpoints).toEqual({
      "api-server": `http://${enabled.id}.api.mock.local`,
      webhook: `http://${enabled.id}.hooks.mock.local`,
      teams: null,
    });
  });
});

describe("MockRuntime shared env sets", () => {
  it("creates an env set with a generated id and empty vars", async () => {
    const runtime = new MockRuntime();
    const set = await runtime.createSharedEnvSet({
      userId: "user-1",
      name: "My Set",
      description: "desc",
    });

    expect(set.id).toMatch(/^envset-/);
    expect(set.userId).toBe("user-1");
    expect(set.name).toBe("My Set");
    expect(set.description).toBe("desc");
    expect(set.envVars).toEqual([]);
    expect(set.createdAt).toBeInstanceOf(Date);
  });

  it("gets a created env set and returns null for a missing one", async () => {
    const runtime = new MockRuntime();
    const created = await runtime.createSharedEnvSet({ userId: "user-1", name: "S" });

    expect((await runtime.getSharedEnvSet(created.id))?.id).toBe(created.id);
    expect(await runtime.getSharedEnvSet("envset-nope")).toBeNull();
  });

  it("adds, updates, and removes env vars, surfacing names only", async () => {
    const runtime = new MockRuntime();
    const created = await runtime.createSharedEnvSet({ userId: "user-1", name: "S" });

    await runtime.addEnvVar(created.id, { name: "A", value: "1" });
    await runtime.addEnvVar(created.id, { name: "B", value: "2" });
    expect((await runtime.getSharedEnvSet(created.id))?.envVars).toEqual([
      { name: "A" },
      { name: "B" },
    ]);

    const updated = await runtime.updateEnvVar(created.id, { name: "A", value: "1b" });
    expect(updated.envVars).toEqual([{ name: "A" }, { name: "B" }]);

    const removed = await runtime.removeEnvVar(created.id, "A");
    expect(removed.envVars).toEqual([{ name: "B" }]);
  });

  it("throws for update/remove of an absent var and ops on a missing set", async () => {
    const runtime = new MockRuntime();
    const created = await runtime.createSharedEnvSet({ userId: "user-1", name: "S" });

    await expect(runtime.updateEnvVar(created.id, { name: "X", value: "1" })).rejects.toThrow(
      /not found/
    );
    await expect(runtime.removeEnvVar(created.id, "X")).rejects.toThrow(/not found/);
    await expect(runtime.addEnvVar("envset-nope", { name: "X", value: "1" })).rejects.toThrow(
      /not found/
    );
    await expect(runtime.patchSharedEnvSet("envset-nope", { name: "N" })).rejects.toThrow(
      /not found/
    );
  });

  it("patches and archives env sets and honors the archived filter", async () => {
    const runtime = new MockRuntime();
    const a = await runtime.createSharedEnvSet({ userId: "user-1", name: "A" });
    const b = await runtime.createSharedEnvSet({ userId: "user-1", name: "B" });

    const patched = await runtime.patchSharedEnvSet(a.id, { name: "A2", description: "new" });
    expect(patched.name).toBe("A2");
    expect(patched.description).toBe("new");

    await runtime.archiveSharedEnvSet(b.id);

    const active = await runtime.listSharedEnvSets({ archived: false });
    expect(active.map((x) => x.id)).toEqual([a.id]);
    const archived = await runtime.listSharedEnvSets({ archived: true });
    expect(archived.map((x) => x.id)).toEqual([b.id]);
    expect(archived[0]?.archived).toBe(true);

    expect((await runtime.listSharedEnvSets()).map((x) => x.id).sort()).toEqual(
      [a.id, b.id].sort()
    );
  });
});