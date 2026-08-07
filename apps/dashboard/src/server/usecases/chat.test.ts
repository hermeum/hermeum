import { describe, it, expect, vi } from "vitest";
import type { ToolExecutionOptions } from "@/entities";
import { stringify } from "yaml";

vi.mock("../infras/local-files", () => ({ LocalFiles: vi.fn() }));
vi.mock("../infras/kubernetes/client", () => ({ KubernetesClient: vi.fn() }));
vi.mock("../infras/hermes-skill-index", () => ({ HermesSkillIndex: vi.fn() }));
vi.mock("@/server/libs/config", () => ({
  config: { agentConfigPath: "./agent-config.yaml", docsPath: "./docs/hermes-config" },
}));

import { ChatUseCase, AGENT_CONFIG_CHAT_SYSTEM_PROMPT } from "./chat";
import type { File, FileAdaptor } from "./adaptors/file";
import type { Runtime } from "./adaptors/runtime";
import type { SkillIndexAdaptor, SkillSearchResult } from "./adaptors/skill-index";
import type { HermeumConfig, SharedEnvSet } from "@/entities";

type Doc = { content: string; data?: Record<string, unknown> };

// Runtime with no shared env sets by default. Individual tests override
// `listSharedEnvSets` / `getSharedEnvSet` to feed sets to the chat context.
function makeRuntime(sets: SharedEnvSet[] = []): Runtime {
  return {
    listSharedEnvSets: vi.fn().mockResolvedValue(sets),
    getSharedEnvSet: vi
      .fn()
      .mockImplementation(async (id: string) => sets.find((s) => s.id === id) ?? null),
    listHermesAgents: vi.fn(),
    getHermesAgent: vi.fn(),
    createHermesAgent: vi.fn(),
    patchHermesAgent: vi.fn(),
    archiveHermesAgent: vi.fn(),
    getGatewayToken: vi.fn(),
    createSharedEnvSet: vi.fn(),
    archiveSharedEnvSet: vi.fn(),
    patchSharedEnvSet: vi.fn(),
    addEnvVar: vi.fn(),
    updateEnvVar: vi.fn(),
    removeEnvVar: vi.fn(),
  } as unknown as Runtime;
}

function makeSharedEnvSet(overrides: Partial<SharedEnvSet> = {}): SharedEnvSet {
  return {
    id: "set-1",
    userId: "user-1",
    name: "Set One",
    envVars: [],
    ...overrides,
  } as SharedEnvSet;
}

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

const callOptions = {} as ToolExecutionOptions;

function makeSkillIndex(results: SkillSearchResult[] = []): SkillIndexAdaptor {
  return {
    searchSkills: vi.fn().mockResolvedValue(results),
  } as unknown as SkillIndexAdaptor;
}

// Expected empty-list footer appended to the instructions when there are no
// shared env sets (matches buildSharedEnvSetList's header-only emission).
const EMPTY_SHARED_ENV_SET_BLOCK =
  "Available shared env sets (attach via the `sharedEnvSets` field with " +
  "these ids; read env var names with `readSharedEnvSet` before attaching " +
  "to avoid collisions with the agent's own `env`):\n";

describe("ChatUseCase.getAgentConfigContext", () => {
  it("uses the base system prompt when no agent types are configured", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles({}, undefined));

    const { instructions } = await useCase.getAgentConfigContext();

    // The base prompt is always followed by the available-documents block and
    // the available-shared-env-sets block, even when there are no docs, no
    // sets, and no agent types.
    expect(instructions).toContain(AGENT_CONFIG_CHAT_SYSTEM_PROMPT);
    expect(instructions).toBe(
      AGENT_CONFIG_CHAT_SYSTEM_PROMPT +
        "\n\n" +
        "Available documents (read with `readDocument` before writing any config section you're not fully sure about):\n" +
        "\n\n" +
        EMPTY_SHARED_ENV_SET_BLOCK
    );
  });

  it("appends the configured agent types to the instructions", async () => {
    const useCase = new ChatUseCase(
      makeRuntime(),
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
    const useCase = new ChatUseCase(makeRuntime(), makeFiles());

    const { prompt } = await useCase.getAgentConfigContext();

    expect(prompt).toContain("no agent config draft yet");
  });

  it("embeds the current config as JSON in the prompt", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles());

    const { prompt } = await useCase.getAgentConfigContext({ name: "pr-reviewer" });

    expect(prompt).toContain('"pr-reviewer"');
  });

  it("exposes a client-side updateAgentConfig tool", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles());

    const { tools } = await useCase.getAgentConfigContext();

    expect(tools.updateAgentConfig).toBeDefined();
    expect(tools.updateAgentConfig!.inputSchema).toBeDefined();
    // No execute: the tool runs on the client, which applies the config to
    // the editor and reports back.
    expect(tools.updateAgentConfig!.execute).toBeUndefined();
  });

  it("exposes a client-side readAgentConfig tool", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles());

    const { tools } = await useCase.getAgentConfigContext();

    expect(tools.readAgentConfig).toBeDefined();
    expect(tools.readAgentConfig!.inputSchema).toBeDefined();
    // No execute: the tool runs on the client, which returns the latest
    // editor draft and reports it back.
    expect(tools.readAgentConfig!.execute).toBeUndefined();
  });

  it("instructs the model to call readAgentConfig when the draft may be stale", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles());

    const { instructions } = await useCase.getAgentConfigContext();

    expect(instructions).toContain("readAgentConfig");
  });

  it("does not expose a listDocuments tool (the list is embedded in the prompt)", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles());

    const { tools } = await useCase.getAgentConfigContext();

    expect(tools.listDocuments).toBeUndefined();
    expect(tools.readDocument?.execute).toBeDefined();
  });

  it("exposes a server-executed searchSkills tool", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles());

    const { tools } = await useCase.getAgentConfigContext();

    expect(tools.searchSkills).toBeDefined();
    expect(tools.searchSkills?.execute).toBeDefined();
  });

  it("delegates searchSkills to the injected skill index adaptor", async () => {
    const results: SkillSearchResult[] = [
      { name: "git-pr-review", identifier: "openai/skills/skills/git-pr-review", description: "Review PRs." },
    ];
    const skillIndex = makeSkillIndex(results);
    const useCase = new ChatUseCase(makeRuntime(), makeFiles(), skillIndex);

    const { tools } = await useCase.getAgentConfigContext();
    const result = await tools.searchSkills!.execute!({ query: "review", limit: 5 }, callOptions);

    expect(result).toEqual({ results });
    expect(skillIndex.searchSkills).toHaveBeenCalledWith("review", 5);
  });

  it("defaults the searchSkills limit to 25 when omitted", async () => {
    const skillIndex = makeSkillIndex([]);
    const useCase = new ChatUseCase(makeRuntime(), makeFiles(), skillIndex);

    const { tools } = await useCase.getAgentConfigContext();
    await tools.searchSkills!.execute!({ query: "kubernetes" }, callOptions);

    expect(skillIndex.searchSkills).toHaveBeenCalledWith("kubernetes", 25);
  });

  it("embeds the available documents in the instructions with frontmatter descriptions", async () => {
    const useCase = new ChatUseCase(
      makeRuntime(),
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
      makeRuntime(),
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
      makeRuntime(),
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
    const useCase = new ChatUseCase(makeRuntime(), makeFiles({ model: { content: "# Model doc" } }));

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
    const useCase = new ChatUseCase(makeRuntime(), files);

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

  it("emits only the shared-env-sets header when none exist", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles());

    const { instructions } = await useCase.getAgentConfigContext();

    expect(instructions).toContain(EMPTY_SHARED_ENV_SET_BLOCK);
    expect(instructions).not.toContain("- set-1");
  });

  it("embeds the available shared env sets in the instructions by id", async () => {
    const runtime = makeRuntime([
      makeSharedEnvSet({
        id: "db-creds",
        name: "Database Credentials",
        description: "Postgres connection vars",
        envVars: [{ name: "DATABASE_URL" }, { name: "DB_PASSWORD" }],
      }),
      makeSharedEnvSet({ id: "api-keys", name: "API Keys", envVars: [] }),
    ]);
    const useCase = new ChatUseCase(runtime, makeFiles());

    const { instructions } = await useCase.getAgentConfigContext();

    // Lines lead with the id (the draft's `sharedEnvSets` field wants ids),
    // carry the human name, and append the description when present.
    expect(instructions).toContain("- db-creds: Database Credentials — Postgres connection vars");
    expect(instructions).toContain("- api-keys: API Keys");
    // The db-creds ordering must come before api-keys (runtime returns them
    // in the given order, which is preserved).
    expect(instructions.indexOf("db-creds")).toBeLessThan(instructions.indexOf("api-keys"));
  });

  it("filters out archived shared env sets before listing them", async () => {
    const runtime = makeRuntime([
      makeSharedEnvSet({ id: "live", name: "Live" }),
      makeSharedEnvSet({ id: "gone", name: "Gone", archived: true }),
    ]);
    const useCase = new ChatUseCase(runtime, makeFiles());

    const { instructions } = await useCase.getAgentConfigContext();

    expect(instructions).toContain("- live: Live");
    expect(instructions).not.toContain("- gone");
    // listSharedEnvSets is asked for non-archived sets only.
    expect(runtime.listSharedEnvSets).toHaveBeenCalledWith({ archived: false });
  });

  it("exposes a server-side readSharedEnvSet tool that returns env var names", async () => {
    const runtime = makeRuntime([
      makeSharedEnvSet({
        id: "db-creds",
        name: "Database Credentials",
        envVars: [{ name: "DATABASE_URL" }, { name: "DB_PASSWORD" }],
      }),
    ]);
    const useCase = new ChatUseCase(runtime, makeFiles());

    const { tools } = await useCase.getAgentConfigContext();
    expect(tools.readSharedEnvSet).toBeDefined();
    expect(tools.readSharedEnvSet?.execute).toBeDefined();

    const result = await tools.readSharedEnvSet!.execute!({ ids: ["db-creds"] }, callOptions);

    // Values are never surfaced — only env var names.
    expect(result).toEqual({
      sharedEnvSets: [{ id: "db-creds", envVars: [{ name: "DATABASE_URL" }, { name: "DB_PASSWORD" }] }],
    });
  });

  it("reads multiple shared env sets in one call", async () => {
    const runtime = makeRuntime([
      makeSharedEnvSet({ id: "db-creds", name: "DB", envVars: [{ name: "DATABASE_URL" }] }),
      makeSharedEnvSet({ id: "api-keys", name: "API", envVars: [{ name: "OPENAI_API_KEY" }] }),
    ]);
    const useCase = new ChatUseCase(runtime, makeFiles());

    const { tools } = await useCase.getAgentConfigContext();
    const result = await tools.readSharedEnvSet!.execute!({ ids: ["db-creds", "api-keys"] }, callOptions);

    expect(result).toEqual({
      sharedEnvSets: [
        { id: "db-creds", envVars: [{ name: "DATABASE_URL" }] },
        { id: "api-keys", envVars: [{ name: "OPENAI_API_KEY" }] },
      ],
    });
  });

  it("returns a per-entry error for unknown or archived shared env set ids", async () => {
    const runtime = makeRuntime([
      makeSharedEnvSet({ id: "db-creds", name: "DB", envVars: [{ name: "DATABASE_URL" }] }),
      makeSharedEnvSet({ id: "archived-set", name: "Old", archived: true, envVars: [] }),
    ]);
    const useCase = new ChatUseCase(runtime, makeFiles());

    const { tools } = await useCase.getAgentConfigContext();
    const result = await tools.readSharedEnvSet!.execute!(
      { ids: ["db-creds", "nope", "archived-set"] },
      callOptions
    );

    expect(result).toEqual({
      sharedEnvSets: [
        { id: "db-creds", envVars: [{ name: "DATABASE_URL" }] },
        { id: "nope", error: expect.stringContaining('"nope" not found') },
        { id: "archived-set", error: expect.stringContaining('"archived-set" not found') },
      ],
    });
  });
});
