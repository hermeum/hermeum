import { describe, it, expect, vi } from "vitest";
import type { ToolExecutionOptions } from "@/entities";
import { stringify } from "yaml";

vi.mock("../infras/local-files", () => ({ LocalFiles: vi.fn() }));
vi.mock("../infras/kubernetes/client", () => ({ KubernetesClient: vi.fn() }));
vi.mock("../infras/hermes-skill-index", () => ({ HermesSkillIndex: vi.fn() }));
vi.mock("../infras/console-logger", () => ({
  ConsoleLogger: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));
vi.mock("@/server/libs/config", () => ({
  config: { configPath: "./config.yaml", hermesDocsPath: "./docs/hermes-config" },
}));

import { ChatUseCase, AGENT_CONFIG_CHAT_SYSTEM_PROMPT } from "./chat";
import type { File, FileAdaptor } from "./adaptors/file";
import type { Runtime } from "./adaptors/runtime";
import type { SkillIndexAdaptor } from "./adaptors/skill-index";
import type { SkillSummary } from "@/entities";
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
      if (path === "./config.yaml") {
        return {
          path,
          name: "config",
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

function makeSkillIndex(results: SkillSummary[] = []): SkillIndexAdaptor {
  return {
    searchSkills: vi.fn().mockResolvedValue(results),
  } as unknown as SkillIndexAdaptor;
}

// Expected body appended to the readSharedEnvSet tool description when no
// shared env sets exist (matches buildSharedEnvSetList's none-sentinel
// emission).
const EMPTY_SHARED_ENV_SET_BLOCK = "Available shared env sets: none";

describe("ChatUseCase.getAgentConfigContext", () => {
  it("uses the bare system prompt (no appended lists) when nothing is configured", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles({}, undefined));

    const { instructions } = await useCase.getAgentConfigContext();

    // The doc/shared-env-set lists now live in their tool descriptions, and
    // agent types are returned by the listAgentTypes tool, so the prompt is
    // just the base system prompt with nothing appended.
    expect(instructions).toBe(AGENT_CONFIG_CHAT_SYSTEM_PROMPT);
  });

  it("returns the configured agent types via the listAgentTypes tool, not the instructions", async () => {
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

    const { instructions, tools } = await useCase.getAgentConfigContext();

    // Agent types are no longer appended to the prompt.
    expect(instructions).not.toContain("pr-review");
    expect(instructions).not.toContain("Reviews pull requests");

    expect(tools.listAgentTypes).toBeDefined();
    expect(tools.listAgentTypes?.execute).toBeDefined();
    const result = await tools.listAgentTypes!.execute!({}, callOptions);
    expect(result).toEqual({
      agentTypes: [
        { key: "pr-review", description: "Reviews pull requests" },
        { key: "plain" },
      ],
    });
  });

  it("returns an empty agentTypes array when none are configured", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles({}, undefined));

    const { tools } = await useCase.getAgentConfigContext();

    const result = await tools.listAgentTypes!.execute!({}, callOptions);
    expect(result).toEqual({ agentTypes: [] });
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

  it("exposes a client-side readAgentConfig tool and instructs the model to use it when stale", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles());

    const { tools } = await useCase.getAgentConfigContext();

    expect(tools.readAgentConfig).toBeDefined();
    expect(tools.readAgentConfig!.inputSchema).toBeDefined();
    // No execute: the tool runs on the client, which returns the latest
    // editor draft and reports it back.
    expect(tools.readAgentConfig!.execute).toBeUndefined();
    // The stale-draft guidance lives in the tool description now, not the
    // system prompt.
    expect(tools.readAgentConfig!.description).toContain("stale");
  });

  it("does not expose a listDocuments tool (the list is embedded in the readDocument description)", async () => {
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
    const results: SkillSummary[] = [
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

  it("embeds the available documents in the readDocument description with frontmatter descriptions", async () => {
    const useCase = new ChatUseCase(
      makeRuntime(),
      makeFiles({
        model: { content: "# Model", data: { description: "Model configuration" } },
        webhook: { content: "# Webhook" },
      })
    );

    const { tools } = await useCase.getAgentConfigContext();

    const description = tools.readDocument!.description ?? "";
    expect(description).toContain("- model: Model configuration");
    expect(description).toContain("- webhook");
    expect(description).not.toContain("- webhook:");
  });

  it("groups documents by category alphabetically, then uncategorized last, in the readDocument description", async () => {
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

    const { tools } = await useCase.getAgentConfigContext();
    const description = tools.readDocument!.description ?? "";

    // Categories are surfaced in alphabetical order, uncategorized trailing.
    const coreIdx = description.indexOf("core:");
    const platformsIdx = description.indexOf("platforms:");
    const runtimeIdx = description.indexOf("runtime:");
    const toolsIdx = description.indexOf("tools:");
    const uncategorizedIdx = description.indexOf("Uncategorized:");
    expect(coreIdx).toBeGreaterThanOrEqual(0);
    expect(platformsIdx).toBeGreaterThan(coreIdx);
    expect(runtimeIdx).toBeGreaterThan(platformsIdx);
    expect(toolsIdx).toBeGreaterThan(runtimeIdx);
    expect(uncategorizedIdx).toBeGreaterThan(toolsIdx);

    // Known category blocks contain their grouped docs.
    expect(description).toContain("core:\n- model: Model configuration");
    expect(description).toContain("tools:\n- browser: Browser automation\n- web-search: Web search");
    expect(description).toContain("platforms:\n- webhooks: Webhook routes");
    expect(description).toContain("runtime:\n- observability: Observability");
    expect(description).toContain("Uncategorized:\n- draft");
  });

  it("emits the none sentinel in the readDocument description when no docs exist", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles());

    const { tools } = await useCase.getAgentConfigContext();

    const description = tools.readDocument!.description ?? "";
    expect(description).toContain("Available documents: none");
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

  it("emits the none sentinel in the readSharedEnvSet description when no sets exist", async () => {
    const useCase = new ChatUseCase(makeRuntime(), makeFiles());

    const { tools } = await useCase.getAgentConfigContext();

    const description = tools.readSharedEnvSet!.description ?? "";
    expect(description).toContain(EMPTY_SHARED_ENV_SET_BLOCK);
    expect(description).not.toContain("- set-1");
  });

  it("embeds the available shared env sets in the readSharedEnvSet description by id", async () => {
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

    const { tools } = await useCase.getAgentConfigContext();
    const description = tools.readSharedEnvSet!.description ?? "";

    // Lines lead with the id (the draft's `sharedEnvSets` field wants ids),
    // carry the human name, and append the description when present.
    expect(description).toContain("- db-creds: Database Credentials — Postgres connection vars");
    expect(description).toContain("- api-keys: API Keys");
    // The db-creds ordering must come before api-keys (runtime returns them
    // in the given order, which is preserved).
    expect(description.indexOf("db-creds")).toBeLessThan(description.indexOf("api-keys"));
  });

  it("filters out archived shared env sets before listing them", async () => {
    const runtime = makeRuntime([
      makeSharedEnvSet({ id: "live", name: "Live" }),
      makeSharedEnvSet({ id: "gone", name: "Gone", archived: true }),
    ]);
    const useCase = new ChatUseCase(runtime, makeFiles());

    const { tools } = await useCase.getAgentConfigContext();
    const description = tools.readSharedEnvSet!.description ?? "";

    expect(description).toContain("- live: Live");
    expect(description).not.toContain("- gone");
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
