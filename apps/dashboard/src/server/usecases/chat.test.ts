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

    // The base prompt is always followed by the available-documents block,
    // even when there are no docs and no agent types.
    expect(instructions).toContain(AGENT_CONFIG_CHAT_SYSTEM_PROMPT);
    expect(instructions).toBe(AGENT_CONFIG_CHAT_SYSTEM_PROMPT + "\n\n" + "Available documents (read with `readDocument` before writing any config section you're not fully sure about):\n");
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

  it("exposes a client-side readAgentConfig tool", async () => {
    const useCase = new ChatUseCase(undefined, makeFiles());

    const { tools } = await useCase.getAgentConfigContext();

    expect(tools.readAgentConfig).toBeDefined();
    expect(tools.readAgentConfig!.inputSchema).toBeDefined();
    // No execute: the tool runs on the client, which returns the latest
    // editor draft and reports it back.
    expect(tools.readAgentConfig!.execute).toBeUndefined();
  });

  it("instructs the model to call readAgentConfig when the draft may be stale", async () => {
    const useCase = new ChatUseCase(undefined, makeFiles());

    const { instructions } = await useCase.getAgentConfigContext();

    expect(instructions).toContain("readAgentConfig");
  });

  it("does not expose a listDocuments tool (the list is embedded in the prompt)", async () => {
    const useCase = new ChatUseCase(undefined, makeFiles());

    const { tools } = await useCase.getAgentConfigContext();

    expect(tools.listDocuments).toBeUndefined();
    expect(tools.readDocument?.execute).toBeDefined();
  });

  it("embeds the available documents in the instructions with frontmatter descriptions", async () => {
    const useCase = new ChatUseCase(
      undefined,
      makeFiles({
        model: { content: "# Model", data: { description: "Model configuration" } },
        webhook: { content: "# Webhook" },
      })
    );

    const { instructions } = await useCase.getAgentConfigContext();

    expect(instructions).toContain("- model: Model configuration");
    expect(instructions).toContain("- webhook");
    expect(instructions).not.toContain("- webhook:");
  });

  it("groups documents by category alphabetically, then uncategorized last", async () => {
    const useCase = new ChatUseCase(
      undefined,
      makeFiles({
        // core
        model: { content: "# Model", data: { category: "core", description: "Model configuration" } },
        // tools
        browser: { content: "# Browser", data: { category: "tools", description: "Browser automation" } },
        "web-search": { content: "# Web", data: { category: "tools", description: "Web search" } },
        // platforms
        webhooks: { content: "# Webhooks", data: { category: "platforms", description: "Webhook routes" } },
        // another category — should sort alphabetically alongside the rest
        observability: { content: "# Obs", data: { category: "runtime", description: "Observability" } },
        // uncategorized — trailing block
        draft: { content: "# Draft" },
      })
    );

    const { instructions } = await useCase.getAgentConfigContext();

    // Categories are surfaced in alphabetical order, uncategorized trailing.
    const coreIdx = instructions.indexOf("core:");
    const platformsIdx = instructions.indexOf("platforms:");
    const runtimeIdx = instructions.indexOf("runtime:");
    const toolsIdx = instructions.indexOf("tools:");
    const uncategorizedIdx = instructions.indexOf("Uncategorized:");
    expect(coreIdx).toBeGreaterThanOrEqual(0);
    expect(platformsIdx).toBeGreaterThan(coreIdx);
    expect(runtimeIdx).toBeGreaterThan(platformsIdx);
    expect(toolsIdx).toBeGreaterThan(runtimeIdx);
    expect(uncategorizedIdx).toBeGreaterThan(toolsIdx);

    // Known category blocks contain their grouped docs.
    expect(instructions).toContain("core:\n- model: Model configuration");
    expect(instructions).toContain("tools:\n- browser: Browser automation\n- web-search: Web search");
    expect(instructions).toContain("platforms:\n- webhooks: Webhook routes");
    expect(instructions).toContain("runtime:\n- observability: Observability");
    expect(instructions).toContain("Uncategorized:\n- draft");
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
