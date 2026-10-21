import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/configuration#reasoning-effort
//
// Skipped on purpose: agent.reasoning_overrides and agent.text_verbosity pass
// through via looseObject (promoted to typed entries only if Hermeum needs to
// enforce them).
export const ReasoningEffortSchema = z
  .enum(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"])
  .describe("How much thinking the model does before responding (unset = medium).");

export const ReasoningEffortOverrideSchema = z
  .looseObject({
    enabled: z.boolean().optional(),
    effort: z.string().min(1).optional(),
  })
  .describe("Custom reasoning tier name sent verbatim (enabled/effort).");

export const AgentConfigSchema = z
  .looseObject({
    reasoning_effort: ReasoningEffortSchema.or(ReasoningEffortOverrideSchema)
      .optional()
      .describe("Global reasoning-effort level, or a custom-tier dict."),
  })
  .optional()
  .describe("Agent-level settings (reasoning effort, ...).");

export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
