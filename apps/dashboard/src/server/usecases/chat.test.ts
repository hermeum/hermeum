import { describe, it, expect, vi } from "vitest";

vi.mock("./infras/local-hermeum-config", () => ({ LocalConfig: vi.fn() }));

import { ChatUseCase, AGENT_CONFIG_CHAT_SYSTEM_PROMPT } from "./chat";
import type { ConfigAdaptor } from "./adaptors/config";
import type { HermeumConfig } from "@/entities";

function makeConfig(agentTypes?: HermeumConfig["agentTypes"]): ConfigAdaptor {
  return {
    get: vi.fn().mockReturnValue({
      agentTypes,
      templates: [],
    } satisfies HermeumConfig),
  };
}

describe("ChatUseCase.getAgentConfigContext", () => {
  it("uses the base system prompt when no agent types are configured", () => {
    const useCase = new ChatUseCase(makeConfig(undefined));

    const { instructions } = useCase.getAgentConfigContext();

    expect(instructions).toBe(AGENT_CONFIG_CHAT_SYSTEM_PROMPT);
  });

  it("appends the configured agent types to the instructions", () => {
    const useCase = new ChatUseCase(
      makeConfig({
        "pr-review": { description: "Reviews pull requests", mutatingWebhookJsonPatch: [] },
        plain: { mutatingWebhookJsonPatch: [] },
      })
    );

    const { instructions } = useCase.getAgentConfigContext();

    expect(instructions).toContain(AGENT_CONFIG_CHAT_SYSTEM_PROMPT);
    expect(instructions).toContain("- pr-review: Reviews pull requests");
    expect(instructions).toContain("- plain");
  });

  it("notes the missing draft when no current config is given", () => {
    const useCase = new ChatUseCase(makeConfig());

    const { prompt } = useCase.getAgentConfigContext();

    expect(prompt).toContain("no agent config draft yet");
  });

  it("embeds the current config as JSON in the prompt", () => {
    const useCase = new ChatUseCase(makeConfig());

    const { prompt } = useCase.getAgentConfigContext({ name: "pr-reviewer" });

    expect(prompt).toContain('"pr-reviewer"');
  });

  it("exposes a client-side updateAgentConfig tool", () => {
    const useCase = new ChatUseCase(makeConfig());

    const { tools } = useCase.getAgentConfigContext();

    expect(tools.updateAgentConfig).toBeDefined();
    expect(tools.updateAgentConfig!.inputSchema).toBeDefined();
    // No execute: the tool runs on the client, which applies the config to
    // the editor and reports back.
    expect(tools.updateAgentConfig!.execute).toBeUndefined();
  });
});
