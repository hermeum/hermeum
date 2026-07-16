import { describe, it, expect, vi } from "vitest";
import type { ToolCallOptions } from "ai";

vi.mock("../infras/local-hermeum-config", () => ({ LocalConfig: vi.fn() }));
vi.mock("../infras/local-documents", () => ({ LocalDocuments: vi.fn() }));

import { ChatUseCase, AGENT_CONFIG_CHAT_SYSTEM_PROMPT } from "./chat";
import type { ConfigAdaptor } from "./adaptors/config";
import type { DocumentAdaptor } from "./adaptors/document";
import type { HermeumConfig } from "@/entities";

function makeConfig(agentTypes?: HermeumConfig["agentTypes"]): ConfigAdaptor {
  return {
    get: vi.fn().mockReturnValue({
      agentTypes,
      templates: [],
    } satisfies HermeumConfig),
  };
}

function makeDocuments(docs: Record<string, string> = {}): DocumentAdaptor {
  return {
    list: vi
      .fn()
      .mockResolvedValue(Object.keys(docs).map((name) => ({ name, description: `${name} doc` }))),
    read: vi.fn().mockImplementation(async (name: string) => docs[name] ?? null),
  };
}

const callOptions = {} as ToolCallOptions;

describe("ChatUseCase.getAgentConfigContext", () => {
  it("uses the base system prompt when no agent types are configured", () => {
    const useCase = new ChatUseCase(makeConfig(undefined), makeDocuments());

    const { instructions } = useCase.getAgentConfigContext();

    expect(instructions).toBe(AGENT_CONFIG_CHAT_SYSTEM_PROMPT);
  });

  it("appends the configured agent types to the instructions", () => {
    const useCase = new ChatUseCase(
      makeConfig({
        "pr-review": { description: "Reviews pull requests", mutatingWebhookJsonPatch: [] },
        plain: { mutatingWebhookJsonPatch: [] },
      }),
      makeDocuments()
    );

    const { instructions } = useCase.getAgentConfigContext();

    expect(instructions).toContain(AGENT_CONFIG_CHAT_SYSTEM_PROMPT);
    expect(instructions).toContain("- pr-review: Reviews pull requests");
    expect(instructions).toContain("- plain");
  });

  it("notes the missing draft when no current config is given", () => {
    const useCase = new ChatUseCase(makeConfig(), makeDocuments());

    const { prompt } = useCase.getAgentConfigContext();

    expect(prompt).toContain("no agent config draft yet");
  });

  it("embeds the current config as JSON in the prompt", () => {
    const useCase = new ChatUseCase(makeConfig(), makeDocuments());

    const { prompt } = useCase.getAgentConfigContext({ name: "pr-reviewer" });

    expect(prompt).toContain('"pr-reviewer"');
  });

  it("exposes a client-side updateAgentConfig tool", () => {
    const useCase = new ChatUseCase(makeConfig(), makeDocuments());

    const { tools } = useCase.getAgentConfigContext();

    expect(tools.updateAgentConfig).toBeDefined();
    expect(tools.updateAgentConfig!.inputSchema).toBeDefined();
    // No execute: the tool runs on the client, which applies the config to
    // the editor and reports back.
    expect(tools.updateAgentConfig!.execute).toBeUndefined();
  });

  it("exposes listDocuments and readDocument as server-executed tools", () => {
    const useCase = new ChatUseCase(makeConfig(), makeDocuments());

    const { tools } = useCase.getAgentConfigContext();

    expect(tools.listDocuments?.execute).toBeDefined();
    expect(tools.readDocument?.execute).toBeDefined();
  });

  it("lists the adaptor's documents", async () => {
    const useCase = new ChatUseCase(makeConfig(), makeDocuments({ model: "# Model" }));

    const { tools } = useCase.getAgentConfigContext();
    const result = await tools.listDocuments!.execute!({}, callOptions);

    expect(result).toEqual({ documents: [{ name: "model", description: "model doc" }] });
  });

  it("reads multiple documents in one call", async () => {
    const useCase = new ChatUseCase(
      makeConfig(),
      makeDocuments({ model: "# Model doc", webhook: "# Webhook doc" })
    );

    const { tools } = useCase.getAgentConfigContext();
    const result = await tools.readDocument!.execute!({ names: ["model", "webhook"] }, callOptions);

    expect(result).toEqual({
      documents: [
        { name: "model", content: "# Model doc" },
        { name: "webhook", content: "# Webhook doc" },
      ],
    });
  });

  it("returns a per-entry error for unknown names without failing the batch", async () => {
    const useCase = new ChatUseCase(makeConfig(), makeDocuments({ model: "# Model doc" }));

    const { tools } = useCase.getAgentConfigContext();
    const result = await tools.readDocument!.execute!({ names: ["model", "nope"] }, callOptions);

    expect(result).toEqual({
      documents: [
        { name: "model", content: "# Model doc" },
        { name: "nope", error: expect.stringContaining('"nope" not found') },
      ],
    });
  });
});
