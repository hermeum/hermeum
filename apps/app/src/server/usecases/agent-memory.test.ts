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
import { InMemoryMemoryStore } from "./adaptors/mocks/memory";
import type { AgentMemoryOperation } from "./agent-memory";

const AGENT = "agent-1";

function makeUseCase(): AgentMemoryUseCase {
  return new AgentMemoryUseCase(new InMemoryMemoryStore());
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
