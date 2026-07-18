import { tool, ToolSet } from "ai";
import { z } from "zod";

import { AgentInput, AgentInputObjectSchema } from "@/entities";
import { config } from "@/server/libs/config";

import { BaseUseCase, HermeumConfigLoadable } from "./mixin";

const DOCS_PATH = config.docsPath;

// Document names come from the LLM; only simple slugs are accepted so a
// crafted name can't traverse outside DOCS_PATH.
const DOCUMENT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

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
  // skip the list-tool round-trip and batch-read directly.
  private async buildDocumentList(): Promise<string> {
    const files = await this.files.listFiles(DOCS_PATH);
    const lines = files
      .filter((file) => file.path.endsWith(".md"))
      .map(({ name, data }) =>
        typeof data.description === "string" ? `- ${name}: ${data.description}` : `- ${name}`
      );
    return "Available documents (read with `readDocument` before writing any " +
      "config section you're not fully sure about):\n" +
      lines.join("\n");
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

Whenever the draft should change, call the \`updateAgentConfig\` tool with the
FULL updated definition — keep every field not affected by the change
unchanged. After a config update, reply with one short sentence noting what
changed plus a brief question about what to refine next (e.g. the tone, the
scope, or the tools setup). Ask at most one question at a time, and keep all
replies concise.`;
