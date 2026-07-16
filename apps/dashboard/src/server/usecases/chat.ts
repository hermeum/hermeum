import { tool, ToolSet } from "ai";

import { AgentInput, AgentInputObjectSchema } from "@/entities";

import { LocalConfig } from "../infras/local-hermeum-config";
import { ConfigAdaptor } from "./adaptors/config";

export interface AgentConfigContext {
  instructions: string;
  prompt: string;
  tools: ToolSet;
}

export class ChatUseCase {
  constructor(private readonly config: ConfigAdaptor = new LocalConfig()) {}

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
