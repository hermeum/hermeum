import { z } from "zod";

// Agent type entity: the key format for configured agent types and the
// picker-facing summary shape. Agent types are defined in Hermeum's own
// configuration (see hermeum-config.ts); agents reference them by `type` key.

// Reserved agent type key: agents without an explicit `type` fall back to
// `agentTypes[DEFAULT_AGENT_TYPE_KEY]` when the mutating webhook resolves
// their patch. It is a normal, settable type everywhere else, but hidden
// from the picker and the AI config generator's type list.
export const DEFAULT_AGENT_TYPE_KEY = "default";

export const AgentTypeKeySchema = z
  .string()
  .min(1)
  .max(128, "Agent type key exceeds maximum length of 128 characters")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'Agent type key must be a slug: lowercase letters, digits, and hyphens (e.g. "email-triage").'
  );

export type AgentTypeKey = z.infer<typeof AgentTypeKeySchema>;

export const AgentTypeSummarySchema = z.object({
  key: AgentTypeKeySchema,
  description: z.string().optional(),
});

export type AgentTypeSummary = z.infer<typeof AgentTypeSummarySchema>;