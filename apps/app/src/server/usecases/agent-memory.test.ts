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

const AGENT = "agent-1";

function makeUseCase(): AgentMemoryUseCase {
  return new AgentMemoryUseCase(new InMemoryMemoryStore());
}

describe("AgentMemoryUseCase.add", () => {
  it("rejects empty content", async () => {
    const memory = makeUseCase();
    await expect(memory.add(AGENT, { content: "   " })).resolves.toEqual({
      success: false,
      error: "Content cannot be empty.",
    });
  });

  it("adds an entry and returns the native success payload", async () => {
    const memory = makeUseCase();
    const result = await memory.add(AGENT, { content: "  runs macOS  " });
    expect(result).toEqual({
      success: true,
      done: true,
      target: "memory",
      entryCount: 1,
      message: "Entry added.",
    });
    await expect(memory.read(AGENT)).resolves.toEqual([
      expect.objectContaining({ agentId: AGENT, content: "runs macOS" }),
    ]);
  });

  it("skips exact duplicates with the native message", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "runs macOS" });
    await expect(memory.add(AGENT, { content: "runs macOS" })).resolves.toEqual({
      success: true,
      done: true,
      target: "memory",
      entryCount: 1,
      message: "Entry already exists (no duplicate added).",
    });
  });

  it("scopes entries per agent", async () => {
    const memory = makeUseCase();
    await memory.add("agent-1", { content: "one" });
    await memory.add("agent-2", { content: "two" });
    await expect(memory.read("agent-1")).resolves.toHaveLength(1);
    await expect(memory.read("agent-2")).resolves.toHaveLength(1);
  });
});

describe("AgentMemoryUseCase.patch", () => {
  it("replaces one span and keeps the rest of the entry", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "User prefers dark mode in all editors" });

    const result = await memory.patch(AGENT, {
      oldText: "dark mode in all editors",
      content: "light mode in VS Code, dark mode in terminal",
    });

    expect(result).toEqual({
      success: true,
      done: true,
      target: "memory",
      entryCount: 1,
      message: "Entry patched.",
    });
    await expect(memory.read(AGENT)).resolves.toEqual([
      expect.objectContaining({ content: "User prefers light mode in VS Code, dark mode in terminal" }),
    ]);
  });

  it("prefers an exact whole-entry match over substring matches", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "alpha beta" });
    await memory.add(AGENT, { content: "alpha" });

    await memory.patch(AGENT, { oldText: "alpha", content: "gamma" });

    const contents = (await memory.read(AGENT)).map((entry) => entry.content);
    expect(contents).toEqual(["alpha beta", "gamma"]);
  });

  it("reports ambiguous substring matches with previews", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "dark mode" });
    await memory.add(AGENT, { content: "light mode" });

    const result = await memory.patch(AGENT, { oldText: "mode", content: "theme" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe("Multiple entries matched 'mode'. Be more specific.");
    expect(result.matches).toEqual(["dark mode", "light mode"]);
  });

  it("rejects a span that occurs more than once in the matched entry", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "aaa aaa" });

    const result = await memory.patch(AGENT, { oldText: "aa", content: "b" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("appears 4 times in the matched entry");
  });

  it("rejects a no-op patch", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "hello world" });

    const result = await memory.patch(AGENT, { oldText: "hello", content: "hello" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Patch is a no-op");
  });

  it("returns current entries when nothing matches", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "runs macOS" });

    const result = await memory.patch(AGENT, { oldText: "zzz", content: "x" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("No entry matched 'zzz'.");
    expect(result.currentEntries).toEqual(["runs macOS"]);
    // Native omits closest_entries when nothing clears the 30% overlap bar.
    expect(result.closestEntries).toBeUndefined();
  });

  it("requires old_text and content", async () => {
    const memory = makeUseCase();
    await expect(memory.patch(AGENT, { oldText: " ", content: "x" })).resolves.toEqual({
      success: false,
      error: "old_text cannot be empty.",
    });
    const missing = await memory.patch(AGENT, { oldText: "x", content: "  " });
    expect(missing.success).toBe(false);
    if (missing.success) return;
    expect(missing.error).toContain("content (the new text for the old_text span) is required");
  });
});

describe("AgentMemoryUseCase.remove", () => {
  it("removes the entry matching a unique substring", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "keep me" });
    await memory.add(AGENT, { content: "delete me" });

    await expect(memory.remove(AGENT, { oldText: "delete" })).resolves.toEqual({
      success: true,
      done: true,
      target: "memory",
      entryCount: 1,
      message: "Entry removed.",
    });
    const contents = (await memory.read(AGENT)).map((entry) => entry.content);
    expect(contents).toEqual(["keep me"]);
  });

  it("returns current entries when nothing matches", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "keep me" });

    const result = await memory.remove(AGENT, { oldText: "zzz" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.currentEntries).toEqual(["keep me"]);
  });
});

describe("AgentMemoryUseCase.batch", () => {
  it("applies add/patch/remove atomically against the final state", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "stale entry" });
    await memory.add(AGENT, { content: "runs macOS" });

    const result = await memory.batch(AGENT, {
      operations: [
        { action: "remove", oldText: "stale" },
        { action: "patch", oldText: "macOS", content: "Linux" },
        { action: "add", content: "uses zsh" },
      ],
    });

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

  it("writes nothing when any operation fails", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "alpha" });
    await memory.add(AGENT, { content: "beta" });

    const result = await memory.batch(AGENT, {
      operations: [
        { action: "patch", oldText: "alpha", content: "ALPHA" },
        { action: "patch", oldText: "zzz", content: "x" },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("No operations were applied (batch is all-or-nothing).");
    expect(result.currentEntries).toBeUndefined();
    expect(result.closestEntries).toBeUndefined();
    const contents = (await memory.read(AGENT)).map((entry) => entry.content);
    expect(contents).toEqual(["alpha", "beta"]);
  });

  it("skips duplicate adds idempotently inside a batch", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "alpha" });

    const result = await memory.batch(AGENT, {
      operations: [{ action: "add", content: "alpha" }],
    });

    expect(result).toMatchObject({ success: true, entryCount: 1 });
    expect(await memory.read(AGENT)).toHaveLength(1);
  });

  it("refuses a multi-op batch that empties a non-empty store", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "alpha" });
    await memory.add(AGENT, { content: "beta" });

    const result = await memory.batch(AGENT, {
      operations: [
        { action: "remove", oldText: "alpha" },
        { action: "remove", oldText: "beta" },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Refusing to empty memory");
    expect(await memory.read(AGENT)).toHaveLength(2);
  });

  it("allows a deliberate single-op remove of the final entry", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "only" });

    const result = await memory.batch(AGENT, {
      operations: [{ action: "remove", oldText: "only" }],
    });

    expect(result).toMatchObject({ success: true, entryCount: 0 });
  });

  it("rejects an empty operations list", async () => {
    const memory = makeUseCase();
    const result = await memory.batch(AGENT, { operations: [] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("operations list is empty.");
  });

  it("prefixes per-operation failures with the operation position", async () => {
    const memory = makeUseCase();
    await memory.add(AGENT, { content: "alpha" });

    const result = await memory.batch(AGENT, {
      operations: [{ action: "patch", oldText: "alpha", content: "   " }],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Operation 1 (patch): content is required");
  });
});
