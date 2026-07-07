import { describe, it, expect, vi } from "vitest";

vi.mock("../infras/ai/generator", () => ({ AiConfigGenerator: vi.fn() }));

import type { AgentInput, Context } from "@/entities";
import { AgentInputSchema } from "@/entities";

import { AgentConfigGeneratorUseCase } from "./agent-config-generator";
import type { ConfigGenerator } from "./adaptors/generator";

function makeGenerator(output: AgentInput = {}): ConfigGenerator {
  return { generate: vi.fn().mockResolvedValue(output) };
}

function makeCtx(userId = "user-1"): Context {
  return {
    session: { id: "session-1", userId, expiresAt: new Date() },
    user: { id: userId, email: "user@example.com", name: "User", createdAt: new Date() },
  };
}

describe("AgentConfigGeneratorUseCase.create", () => {
  it("passes the user prompt to the generator and returns its output", async () => {
    const generator = makeGenerator({ name: "pr-reviewer" });
    const useCase = new AgentConfigGeneratorUseCase(generator);

    const result = await useCase.create(makeCtx(), "A PR review agent");

    expect(generator.generate).toHaveBeenCalledWith(expect.stringContaining("A PR review agent"));
    expect(result.name).toBe("pr-reviewer");
  });

  it("throws when the generator returns an invalid shape", async () => {
    const generator = {
      generate: vi.fn().mockResolvedValue({ skills: ["bad skill!"] }),
    };
    const useCase = new AgentConfigGeneratorUseCase(generator);

    await expect(useCase.create(makeCtx(), "prompt")).rejects.toThrow();
  });
});

describe("AgentConfigGeneratorUseCase.update", () => {
  it("includes the current definition and instruction in the prompt", async () => {
    const generator = makeGenerator({ name: "updated" });
    const useCase = new AgentConfigGeneratorUseCase(generator);
    const current: AgentInput = { name: "old-agent", description: "old description" };

    await useCase.update(makeCtx(), current, "rename it");

    const prompt = (generator.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(prompt).toContain('"old-agent"');
    expect(prompt).toContain("rename it");
  });

  it("preserves <secret> for vars that were already sensitive", async () => {
    const generator = makeGenerator({
      env: [{ name: "API_KEY", value: "<secret>", sensitive: true }],
    });
    const useCase = new AgentConfigGeneratorUseCase(generator);
    const current: AgentInput = {
      env: [{ name: "API_KEY", value: "<secret>", sensitive: true }],
    };

    const result = await useCase.update(makeCtx(), current, "change the name");

    expect(result.env).toEqual([{ name: "API_KEY", value: "<secret>", sensitive: true }]);
  });

  it("replaces <secret> for vars that were not previously sensitive", async () => {
    const generator = makeGenerator({
      env: [{ name: "NEW_KEY", value: "<secret>", sensitive: true }],
    });
    const useCase = new AgentConfigGeneratorUseCase(generator);

    const result = await useCase.update(makeCtx(), {}, "add a key");

    expect(result.env).toEqual([{ name: "NEW_KEY", value: "<fill-me>", sensitive: true }]);
  });
});

describe("AgentConfigGeneratorUseCase env scrubbing", () => {
  it("replaces invented sensitive values with the placeholder", async () => {
    const generator = makeGenerator({
      env: [
        { name: "API_KEY", value: "sk-abc123", sensitive: true },
        { name: "LOG_LEVEL", value: "debug" },
      ],
    });
    const useCase = new AgentConfigGeneratorUseCase(generator);

    const result = await useCase.create(makeCtx(), "prompt");

    expect(result.env).toEqual([
      { name: "API_KEY", value: "<fill-me>", sensitive: true },
      { name: "LOG_LEVEL", value: "debug" },
    ]);
  });

  it("replaces <secret> on create since there is no stored secret", async () => {
    const generator = makeGenerator({
      env: [{ name: "API_KEY", value: "<secret>", sensitive: true }],
    });
    const useCase = new AgentConfigGeneratorUseCase(generator);

    const result = await useCase.create(makeCtx(), "prompt");

    expect(result.env).toEqual([{ name: "API_KEY", value: "<fill-me>", sensitive: true }]);
  });

  it("appends a sensitive WEBHOOK_SECRET when the webhook is enabled but missing", async () => {
    const generator = makeGenerator({
      config: { platforms: { webhook: { enabled: true } } },
    });
    const useCase = new AgentConfigGeneratorUseCase(generator);

    const result = await useCase.create(makeCtx(), "prompt");

    expect(result.env).toEqual([{ name: "WEBHOOK_SECRET", value: "<fill-me>", sensitive: true }]);
    expect(AgentInputSchema.safeParse(result).success).toBe(true);
  });

  it("appends a sensitive API_SERVER_KEY when the api server is enabled but missing", async () => {
    const generator = makeGenerator({
      config: { api_server: { enabled: true } },
    });
    const useCase = new AgentConfigGeneratorUseCase(generator);

    const result = await useCase.create(makeCtx(), "prompt");

    expect(result.env).toEqual([{ name: "API_SERVER_KEY", value: "<fill-me>", sensitive: true }]);
    expect(AgentInputSchema.safeParse(result).success).toBe(true);
  });

  it("does not duplicate WEBHOOK_SECRET when already present", async () => {
    const generator = makeGenerator({
      config: { platforms: { webhook: { enabled: true } } },
      env: [{ name: "WEBHOOK_SECRET", value: "<fill-me>", sensitive: true }],
    });
    const useCase = new AgentConfigGeneratorUseCase(generator);

    const result = await useCase.create(makeCtx(), "prompt");

    expect(result.env).toEqual([{ name: "WEBHOOK_SECRET", value: "<fill-me>", sensitive: true }]);
  });

  it("does not append sensitive vars when the features are disabled", async () => {
    const generator = makeGenerator({
      config: { platforms: { webhook: { enabled: false } }, api_server: { enabled: false } },
    });
    const useCase = new AgentConfigGeneratorUseCase(generator);

    const result = await useCase.create(makeCtx(), "prompt");

    expect(result.env).toBeUndefined();
  });
});
