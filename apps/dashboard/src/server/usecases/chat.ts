import { z } from "zod";

import { AgentInput, AgentInputObjectSchema, tool, ToolSet } from "@/entities";
import { config } from "@/server/libs/config";

import { BaseUseCase, HermeumConfigLoadable } from "./mixin";
import type { File } from "./adaptors/file";

const DOCS_PATH = config.hermesDocsPath;

// Document names come from the LLM; only simple slugs are accepted so a
// crafted name can't traverse outside DOCS_PATH.
const DOCUMENT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

// Label used for the trailing block that groups docs with no `category`
// frontmatter field.
const UNCATEGORIZED_LABEL = "Uncategorized";

export interface AgentConfigContext {
  instructions: string;
  prompt: string;
  tools: ToolSet;
}

export class ChatUseCase extends HermeumConfigLoadable(BaseUseCase) {
  // Everything the chat route needs for an agent-config conversation turn:
  // the system prompt, a context block describing the current draft, and the
  // tool set the model uses to read docs/shared env sets, list agent types,
  // search skills, and apply config changes. The available documents and
  // shared env sets are embedded in their respective tool descriptions (not
  // the system prompt) so the model sees them right at the tool definition.
  async getAgentConfigContext(currentConfig?: AgentInput): Promise<AgentConfigContext> {
    const ctx: AgentConfigContext = {
      instructions: AGENT_CONFIG_CHAT_SYSTEM_PROMPT,
      prompt:
        currentConfig === undefined
          ? "There is no agent config draft yet."
          : "Current agent config draft as JSON:\n\n" + JSON.stringify(currentConfig, null, 2),
      tools: {
        readDocument: await this.buildReadDocumentTool(),
        readSharedEnvSet: await this.buildReadSharedEnvSetTool(),
        listAgentTypes: await this.buildListAgentTypesTool(),
        searchSkills: tool({
          description:
            "Search the Hermes Skills Index for an installable agent skill " +
            "by name, keyword, or capability. Pass an empty query to list " +
            "featured skills.",
          inputSchema: z.object({
            query: z.string().describe("Search query (skill name, capability, or keyword)."),
            limit: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional()
              .describe("Max results (default 25)."),
          }),
          execute: async ({ query, limit }) => ({
            results: await this.skillIndex.searchSkills(query, limit ?? 25),
          }),
        }),
        readAgentConfig: tool({
          description:
            "Read the current agent config draft straight from the user's " +
            "editor. Use this whenever you need to ground a change in the " +
            "latest draft — the snapshot in the conversation may be stale " +
            "because the user can hand-edit the config between messages.",
          inputSchema: z.object({}),
          // No `execute`: the client returns the latest editor draft and
          // reports it back.
        }),
        updateAgentConfig: tool({
          description:
            "Replace the agent config draft with a full updated definition. " +
            "Always pass the COMPLETE config, keeping every field not affected " +
            "by the requested change unchanged.",
          inputSchema: AgentInputObjectSchema,
          // No `execute`: the client applies the config to its editor and
          // reports the result back.
        }),
      },
    };
    this.logger.info("built agent config context", { hasDraft: currentConfig !== undefined });
    return ctx;
  }

  // Server-executed tool that lets the model pull Hermes agent configuration
  // documents on demand. The list of available documents is built here and
  // embedded in the description up front, so the model can plan a single
  // batched call without first calling a list tool.
  private async buildReadDocumentTool(): Promise<ToolSet[string]> {
    const docList = await this.buildDocumentList();
    return tool({
      description:
        "Read one or more Hermes agent configuration documents by name. " +
        "Pass every document you need in a single call to minimize " +
        "round-trips.\n\n" + docList,
      inputSchema: z.object({
        names: z.array(z.string()).min(1).describe("Document names from the list above."),
      }),
      execute: async ({ names }) => {
        const documents = await Promise.all(
          names.map(async (name) => {
            const file = DOCUMENT_NAME_RE.test(name)
              ? await this.files.readFile(`${DOCS_PATH}/${name}.md`)
              : null;
            return file === null
              ? {
                  name,
                  error: `Document "${name}" not found. Use the names listed in the tool description.`,
                }
              : { name, content: file.content };
          })
        );
        this.logger.debug("read documents", { names });
        return { documents };
      },
    });
  }

  // Server-executed tool that lets the model inspect the env var names inside
  // one or more shared env sets (ids are listed in the description). The values
  // are never surfaced — shared env sets only carry env var names; the values
  // live in Kubernetes Secrets the agent loads via `envFrom`. Batch every id
  // you need into a single call to minimize round-trips.
  private async buildReadSharedEnvSetTool(): Promise<ToolSet[string]> {
    const sharedEnvSetList = await this.buildSharedEnvSetList();
    return tool({
      description:
        "Read the env var names inside one or more shared env sets by id. " +
        "Use this before attaching a set to avoid name collisions with the " +
        "agent's own `env`, or to confirm a needed var is present. Pass every " +
        "id you need in a single call to minimize round-trips. To attach a " +
        "set, add its id to the draft's `sharedEnvSets` array.\n\n" + sharedEnvSetList,
      inputSchema: z.object({
        ids: z.array(z.string()).min(1).describe("Shared env set ids from the list above."),
      }),
      execute: async ({ ids }) => {
        const sharedEnvSets = await Promise.all(
          ids.map(async (id) => {
            const set = await this.runtime.getSharedEnvSet(id);
            if (set === null || set.archived) {
              return {
                id,
                error: `Shared env set "${id}" not found. Use the ids listed in the tool description.`,
              };
            }
            return { id, envVars: set.envVars.map(({ name }) => ({ name })) };
          })
        );
        this.logger.debug("read shared env sets", { ids });
        return { sharedEnvSets };
      },
    });
  }

  // Server-executed tool that returns the configured agent types the draft's
  // `type` field can be set to. The types are loaded here once per turn at
  // context-build time, so execute is a cheap synchronous lookup. Returns an
  // empty array when no agent types are configured.
  private async buildListAgentTypesTool(): Promise<ToolSet[string]> {
    const { agentTypes } = await this.loadHermeumConfig();
    const entries = agentTypes
      ? Object.entries(agentTypes).map(([key, t]) => ({
          key,
          ...(t.description !== undefined ? { description: t.description } : {}),
        }))
      : [];
    return tool({
      description:
        "List the configured agent types the draft's `type` field can be set " +
        "to. Set `type` only when the request clearly matches one of these; " +
        "otherwise omit it.",
      inputSchema: z.object({}),
      execute: async () => {
        this.logger.debug("listed agent types", { count: entries.length });
        return { agentTypes: entries };
      },
    });
  }

  // Build the "Available documents:" block listing every Hermes config doc the
  // model can request via `readDocument`. Embedded in the tool description so
  // the model can skip a list-tool round-trip and batch-read directly. Docs are
  // grouped under their frontmatter `category` (categories discovered
  // dynamically from the docs themselves, surfaced alphabetically); docs with
  // no `category` field are grouped together in a trailing `Uncategorized`
  // block. When no docs exist, a `none` sentinel is emitted.
  private async buildDocumentList(): Promise<string> {
    const files = (await this.files.listFiles(DOCS_PATH)).filter((file) =>
      file.path.endsWith(".md")
    );
    if (files.length === 0) {
      return "Available documents: none";
    }

    const lineFor = ({ name, data }: File) =>
      typeof data.description === "string" ? `- ${name}: ${data.description}` : `- ${name}`;

    const categories = new Map<string, File[]>();
    const uncategorized: File[] = [];
    for (const file of files) {
      const category =
        typeof file.data.category === "string" ? file.data.category : undefined;
      if (category === undefined) {
        uncategorized.push(file);
        continue;
      }
      const bucket = categories.get(category) ?? [];
      bucket.push(file);
      categories.set(category, bucket);
    }

    const orderedCategories = [...categories.keys()].sort((a, b) => a.localeCompare(b));

    const blocks: string[] = [];
    for (const category of orderedCategories) {
      const lines = categories.get(category)!.map(lineFor).join("\n");
      blocks.push(`${category}:\n${lines}`);
    }
    if (uncategorized.length > 0) {
      blocks.push(`${UNCATEGORIZED_LABEL}:\n${uncategorized.map(lineFor).join("\n")}`);
    }

    return "Available documents:\n" + blocks.join("\n\n");
  }

  // Build the "Available shared env sets:" block listing every non-archived
  // shared env set the model can attach via the `sharedEnvSets` field. The id
  // (not the human name) is what the draft's `sharedEnvSets` array expects, so
  // each line leads with the id. Embedded in the tool description up front so
  // the model can attach a set without first calling a list tool; env var names
  // inside a set are fetched on demand via `readSharedEnvSet` to keep the
  // description lean. When no sets exist, a `none` sentinel is emitted.
  private async buildSharedEnvSetList(): Promise<string> {
    const sets = (await this.runtime.listSharedEnvSets({ archived: false })).filter(
      (set) => !set.archived
    );
    if (sets.length === 0) {
      return "Available shared env sets: none";
    }
    const lines = sets.map((set) => {
      const tail = set.description ? ` — ${set.description}` : "";
      return `- ${set.id}: ${set.name}${tail}`;
    });
    return "Available shared env sets:\n" + lines.join("\n");
  }
}

// Behavioral rules for the agent-config chat. Tool-specific guidance (when to
// call `readDocument`, `readSharedEnvSet`, `readAgentConfig`,
// `updateAgentConfig`, and the available doc/shared-env-set lists) lives in
// the tool `description` fields, not here, so the model sees each tool's usage
// rules alongside its definition.
export const AGENT_CONFIG_CHAT_SYSTEM_PROMPT = `\
You help a user workshop the definition of a new autonomous agent through
conversation. The current draft is shown to you as JSON; the user also sees
it in an editor and may change it by hand between messages.

After a config update, reply with one short sentence noting what changed
plus a brief question about what to refine next (e.g. the tone, the scope,
or the tools setup). Ask at most one question at a time, and keep all replies
concise.

Note 
- Only write fields the user has asked for or that are strictly required. Skip
every optional field unless the user requests it.
- Never guess at field semantics. When you're not fully sure about a config
section, settle it with the documentation before writing it into the draft.

`;