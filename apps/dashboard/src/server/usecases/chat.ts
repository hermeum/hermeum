import { tool, ToolSet } from "ai";
import { z } from "zod";

import { AgentInput, AgentInputObjectSchema } from "@/entities";
import { config } from "@/server/libs/config";

import { BaseUseCase, HermeumConfigLoadable } from "./mixin";
import type { File } from "./adaptors/file";

const DOCS_PATH = config.docsPath;

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
  // the system prompt (with the available doc list and configured agent types
  // appended), a context block describing the current draft, and the
  // client-side tool the model uses to apply config changes.
  async getAgentConfigContext(currentConfig?: AgentInput): Promise<AgentConfigContext> {
    return {
      instructions: await this.buildInstructions(),
      prompt:
        currentConfig === undefined
          ? "There is no agent config draft yet."
          : "Current agent config draft as JSON:\n\n" + JSON.stringify(currentConfig, null, 2),
      tools: {
        readDocument: this.buildReadDocumentTool(),
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
  }

  // Server-executed tool that lets the model pull a Hermes agent configuration
  // document on demand. The list of available documents is embedded in the
  // system prompt up front, so the model can plan a single batched call
  // without first calling a list tool.
  private buildReadDocumentTool(): ToolSet[string] {
    return tool({
      description:
        "Read one or more Hermes agent configuration documents by name " +
        "(names are listed in the system prompt). Pass every document you " +
        "need in a single call to minimize round-trips.",
      inputSchema: z.object({
        names: z.array(z.string()).min(1).describe("Document names listed in the system prompt."),
      }),
      execute: async ({ names }) => ({
        documents: await Promise.all(
          names.map(async (name) => {
            const file = DOCUMENT_NAME_RE.test(name)
              ? await this.files.readFile(`${DOCS_PATH}/${name}.md`)
              : null;
            return file === null
              ? {
                  name,
                  error: `Document "${name}" not found. Use the names listed in the system prompt.`,
                }
              : { name, content: file.content };
          })
        ),
      }),
    });
  }

  private async buildInstructions(): Promise<string> {
    const [docList, { agentTypes }] = await Promise.all([
      this.buildDocumentList(),
      this.loadHermeumConfig(),
    ]);

    let instructions = AGENT_CONFIG_CHAT_SYSTEM_PROMPT + "\n\n" + docList;

    if (agentTypes) {
      const lines = Object.entries(agentTypes).map(
        ([key, t]) => `- ${key}${t.description ? `: ${t.description}` : ""}`
      );
      instructions +=
        "\n\nAgent types (optional — set `type` only if the request clearly " +
        "matches one; otherwise omit):\n" +
        lines.join("\n");
    }
    return instructions;
  }

  // Build the "Available documents:" block listing every Hermes config doc the
  // model can request via `readDocument`. Embedded up front so the model can
  // skip the list-tool round-trip and batch-read directly. Docs are grouped
  // under their frontmatter `category` (categories discovered dynamically from
  // the docs themselves, surfaced alphabetically); docs with no `category`
  // field are grouped together in a trailing `Uncategorized` block. When no
  // docs exist, only the header is emitted.
  private async buildDocumentList(): Promise<string> {
    const files = (await this.files.listFiles(DOCS_PATH)).filter((file) =>
      file.path.endsWith(".md")
    );
    if (files.length === 0) {
      return "Available documents (read with `readDocument` before writing any " +
        "config section you're not fully sure about):\n";
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

    const orderedCategories = [...categories.keys()].sort((a, b) =>
      a.localeCompare(b)
    );

    const blocks: string[] = [];
    for (const category of orderedCategories) {
      const lines = categories.get(category)!.map(lineFor).join("\n");
      blocks.push(`${category}:\n${lines}`);
    }
    if (uncategorized.length > 0) {
      blocks.push(`${UNCATEGORIZED_LABEL}:\n${uncategorized.map(lineFor).join("\n")}`);
    }

    return "Available documents (read with `readDocument` before writing any " +
      "config section you're not fully sure about):\n" +
      blocks.join("\n\n");
  }
}

// Field semantics live in the tool input schema's .describe() texts; this
// prompt carries the conversational behavior and cross-field rules instead.
// The available documents and configured agent types are appended at runtime.
export const AGENT_CONFIG_CHAT_SYSTEM_PROMPT = `\
You help a user workshop the definition of a new autonomous agent through
conversation. The current draft is shown to you as JSON; the user also sees
it in an editor and may change it by hand between messages.

Detailed documentation about the config fields is available through the
\`readDocument\` tool — the names of the available documents are listed below.
Batch every document you need into a single call, and read up on any config
section you are not fully sure about BEFORE writing it into the draft. Don't
guess at field semantics that a document can settle.

The draft shown in this conversation may be stale because the user can hand-edit
the config in their editor between messages. Call \`readAgentConfig\` to fetch
the latest draft before making any change that depends on the current state of
fields you haven't just written yourself.

Whenever the draft should change, call the \`updateAgentConfig\` tool with the
FULL updated definition — keep every field not affected by the change
unchanged. After a config update, reply with one short sentence noting what
changed plus a brief question about what to refine next (e.g. the tone, the
scope, or the tools setup). Ask at most one question at a time, and keep all
replies concise.`;
