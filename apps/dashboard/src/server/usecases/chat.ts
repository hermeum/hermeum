import { tool, ToolSet } from "ai";
import { z } from "zod";

import { AgentInput, AgentInputObjectSchema } from "@/entities";

import { LocalConfig } from "../infras/local-hermeum-config";
import { LocalDocuments } from "../infras/local-documents";
import { ConfigAdaptor } from "./adaptors/config";
import { DocumentAdaptor } from "./adaptors/document";

export interface AgentConfigContext {
  instructions: string;
  prompt: string;
  tools: ToolSet;
}

export class ChatUseCase {
  constructor(
    private readonly config: ConfigAdaptor = new LocalConfig(),
    private readonly documents: DocumentAdaptor = new LocalDocuments()
  ) {}

  // Everything the chat route needs for an agent-config conversation turn:
  // the system prompt, a context block describing the current draft, and the
  // client-side tool the model uses to apply config changes.
  getAgentConfigContext(currentConfig?: AgentInput): AgentConfigContext {
    return {
      instructions: this.buildInstructions(),
      prompt:
        currentConfig === undefined
          ? "There is no agent config draft yet."
          : "Current agent config draft as JSON:\n\n" + JSON.stringify(currentConfig, null, 2),
      tools: {
        ...this.buildDocumentTools(),
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

  // Server-executed tools that let the model pull Hermes agent configuration
  // documentation on demand, instead of carrying it all in the tool schema.
  private buildDocumentTools(): ToolSet {
    return {
      listDocuments: tool({
        description:
          "List the available Hermes agent configuration documents, with a " +
          "one-line description of each.",
        inputSchema: z.object({}),
        execute: async () => {
          const names = await this.documents.list();
          return {
            documents: await Promise.all(
              names.map(async (name) => {
                const description = (await this.documents.read(name))?.data.description;
                return typeof description === "string" ? { name, description } : { name };
              })
            ),
          };
        },
      }),
      readDocument: tool({
        description:
          "Read one or more Hermes agent configuration documents by name. " +
          "Pass every document you need in a single call to minimize round-trips.",
        inputSchema: z.object({
          names: z.array(z.string()).min(1).describe("Document names from listDocuments."),
        }),
        execute: async ({ names }) => ({
          documents: await Promise.all(
            names.map(async (name) => {
              const file = await this.documents.read(name);
              return file === null
                ? {
                    name,
                    error: `Document "${name}" not found. Call listDocuments for available names.`,
                  }
                : { name, content: file.content };
            })
          ),
        }),
      }),
    };
  }

  private buildInstructions(): string {
    const { agentTypes } = this.config.get();
    if (!agentTypes) {
      return AGENT_CONFIG_CHAT_SYSTEM_PROMPT;
    }

    // Append a list of configured agent types to the system prompt.
    const lines = Object.entries(agentTypes).map(
      ([key, t]) => `- ${key}${t.description ? `: ${t.description}` : ""}`
    );
    return (
      AGENT_CONFIG_CHAT_SYSTEM_PROMPT +
      "\n\nAgent types (optional — set `type` only if the request clearly " +
      "matches one; otherwise omit):\n" +
      lines.join("\n")
    );
  }
}

// Field semantics live in the tool input schema's .describe() texts; this
// prompt carries the conversational behavior and cross-field rules instead.
export const AGENT_CONFIG_CHAT_SYSTEM_PROMPT = `\
You help a user workshop the definition of a new autonomous agent through
conversation. The current draft is shown to you as JSON; the user also sees
it in an editor and may change it by hand between messages.

Detailed documentation about the config fields is available through tools:
call \`listDocuments\` to see what's covered, then \`readDocument\` (batching
every document you need into one call) to read up on any config section you
are not fully sure about BEFORE writing it into the draft. Don't guess at
field semantics that a document can settle.

Whenever the draft should change, call the \`updateAgentConfig\` tool with the
FULL updated definition — keep every field not affected by the change
unchanged. After a config update, reply with one short sentence noting what
changed plus a brief question about what to refine next (e.g. the tone, the
scope, or the tools setup). Ask at most one question at a time, and keep all
replies concise.

Tailor every field to the specific request — don't fall back to generic or
placeholder-sounding content:
- \`name\` and \`description\` should reflect what this particular agent does,
  not a generic template.
- \`soul\` should be written for this agent's actual job and tone, using the
  request's own domain language where possible — not a reused boilerplate
  personality.
- Only set \`config\` sub-features (model, webhooks, api_server) that the
  request actually needs to work. Infer the ones required to fulfill the
  request even if unstated (e.g. "on every new GitHub issue" implies a
  webhook route), but don't add unrelated ones "just in case".
- Webhook routes, prompts, and skills should be built from what the request
  says triggers the agent and what it should do — not copied from an
  unrelated example.
- When the request is ambiguous or gives no basis for a field, omit that
  field rather than guessing or inventing detail that wasn't asked for.
- Never invent values for sensitive env vars: a sensitive var may only hold
  the "<fill-me>" placeholder, or "<secret>" when it already held "<secret>"
  in the current draft.`;
