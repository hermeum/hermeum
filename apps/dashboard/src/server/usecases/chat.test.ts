import { describe, it, expect, vi } from "vitest";
import type { ToolExecutionOptions } from "ai";
import { stringify } from "yaml";

vi.mock("../infras/local-files", () => ({ LocalFiles: vi.fn() }));
vi.mock("@/server/libs/config", () => ({
  config: { agentConfigPath: "./agent-config.yaml", docsPath: "./docs/hermes-config" },
}));

import { ChatUseCase, AGENT_CONFIG_CHAT_SYSTEM_PROMPT } from "./chat";
import type { File, FileAdaptor } from "./adaptors/file";
import type { HermeumConfig } from "@/entities";

type Doc = { content: string; data?: Record<string, unknown> };

function makeFiles(
  docs: Record<string, Doc> = {},
  agentTypes?: HermeumConfig["agentTypes"]
): FileAdaptor {
  const toFile = (name: string): File => ({
    path: `./docs/hermes-config/${name}.md`,
    name,
    content: docs[name]!.content,
    data: docs[name]!.data ?? {},
  });
  return {
    listFiles: vi.fn().mockImplementation(async () => Object.keys(docs).map(toFile)),
    readFile: vi.fn().mockImplementation(async (path: string) => {
      if (path === "./agent-config.yaml") {
        return {
          path,
          name: "agent-config",
          content: stringify({ agentTypes, templates: [] } satisfies HermeumConfig),
          data: {},
        };
      }
      return (
        Object.keys(docs)
          .filter((name) => path === `./docs/hermes-config/${name}.md`)
          .map(toFile)
          .at(0) ?? null
      );
    }),
  };
}

const callOptions = {} as ToolExecutionOptions<never>;

describe("ChatUseCase.getAgentConfigContext", () => {
  it("uses the base system prompt when no agent types are configured", async () => {
    const useCase = new ChatUseCase(undefined, makeFiles({}, undefined));

    const { instructions } = await useCase.getAgentConfigContext();

    expect(instructions).toBe(AGENT_CONFIG_CHAT_SYSTEM_PROMPT);
  });

  it("appends the configured agent types to the instructions", async () => {
    const useCase = new ChatUseCase(
      undefined,
      makeFiles(
        {},
        {
          "pr-review": { description: "Reviews pull requests", mutatingWebhookJsonPatch: [] },
          plain: { mutatingWebhookJsonPatch: [] },
        }
      )
    );

    const { instructions } = await useCase.getAgentConfigContext();

    expect(instructions).toContain(AGENT_CONFIG_CHAT_SYSTEM_PROMPT);
    expect(instructions).toContain("- pr-review: Reviews pull requests");
    expect(instructions).toContain("- plain");
  });

  it("notes the missing draft when no current config is given", async () => {
    const useCase = new ChatUseCase(undefined, makeFiles());

    const { prompt } = await useCase.getAgentConfigContext();

    expect(prompt).toContain("no agent config draft yet");
  });

  it("embeds the current config as JSON in the prompt", async () => {
    const useCase = new ChatUseCase(undefined, makeFiles());

    const { prompt } = await useCase.getAgentConfigContext({ name: "pr-reviewer" });

    expect(prompt).toContain('"pr-reviewer"');
  });

  it("exposes a client-side updateAgentConfig tool", async () => {
    const useCase = new ChatUseCase(undefined, makeFiles());

    const { tools } = await useCase.getAgentConfigContext();

    expect(tools.updateAgentConfig).toBeDefined();
    expect(tools.updateAgentConfig!.inputSchema).toBeDefined();
    // No execute: the tool runs on the client, which applies the config to
    // the editor and reports back.
    expect(tools.updateAgentConfig!.execute).toBeUndefined();
  });

  it("exposes listDocuments and readDocument as server-executed tools", async () => {
    const useCase = new ChatUseCase(undefined, makeFiles());

    const { tools } = await useCase.getAgentConfigContext();

    expect(tools.listDocuments?.execute).toBeDefined();
    expect(tools.readDocument?.execute).toBeDefined();
  });

  it("lists documents with the frontmatter description when present", async () => {
    const useCase = new ChatUseCase(
      undefined,
      makeFiles({
        model: { content: "# Model", data: { description: "Model configuration" } },
        webhook: { content: "# Webhook" },
      })
    );

    const { tools } = await useCase.getAgentConfigContext();
    const result = await tools.listDocuments!.execute!({}, callOptions);

    expect(result).toEqual({
      documents: [{ name: "model", description: "Model configuration" }, { name: "webhook" }],
    });
  });

  it("reads multiple documents in one call", async () => {
    const useCase = new ChatUseCase(
      undefined,
      makeFiles({
        model: { content: "# Model doc" },
        webhook: { content: "# Webhook doc" },
      })
    );

    const { tools } = await useCase.getAgentConfigContext();
    const result = await tools.readDocument!.execute!({ names: ["model", "webhook"] }, callOptions);

    expect(result).toEqual({
      documents: [
        { name: "model", content: "# Model doc" },
        { name: "webhook", content: "# Webhook doc" },
      ],
    });
  });

  it("returns a per-entry error for unknown names without failing the batch", async () => {
    const useCase = new ChatUseCase(undefined, makeFiles({ model: { content: "# Model doc" } }));

    const { tools } = await useCase.getAgentConfigContext();
    const result = await tools.readDocument!.execute!({ names: ["model", "nope"] }, callOptions);

    expect(result).toEqual({
      documents: [
        { name: "model", content: "# Model doc" },
        { name: "nope", error: expect.stringContaining('"nope" not found') },
      ],
    });
  });

  it("rejects path-traversal document names without touching the adaptor", async () => {
    const files = makeFiles({ model: { content: "# Model doc" } });
    const useCase = new ChatUseCase(undefined, files);

    const { tools } = await useCase.getAgentConfigContext();
    vi.mocked(files.readFile).mockClear();
    const result = await tools.readDocument!.execute!(
      { names: ["../secrets", "sub/model", ".hidden"] },
      callOptions
    );

    expect(result).toEqual({
      documents: [
        { name: "../secrets", error: expect.stringContaining("not found") },
        { name: "sub/model", error: expect.stringContaining("not found") },
        { name: ".hidden", error: expect.stringContaining("not found") },
      ],
    });
    expect(files.readFile).not.toHaveBeenCalled();
  });
});
