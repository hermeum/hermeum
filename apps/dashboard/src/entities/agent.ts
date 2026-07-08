import { z } from "zod";

import { ConfigSchema } from "./hermes-config";
import { EnvVarSchema } from "./shared-env-set";

export const ENV_SECRET_SENTINEL = "<secret>";

// Placeholder for generated sensitive env values the user must fill in.
// Distinct from ENV_SECRET_SENTINEL, which the kubernetes client interprets
// as "reuse the value already stored in the Secret".
export const ENV_PLACEHOLDER_SENTINEL = "<fill-me>";

export const AgentEnvVarSchema = EnvVarSchema.extend({
  value: z.string().describe(
    `Env var value. Sensitive values must use the literal placeholder "${ENV_PLACEHOLDER_SENTINEL}" — never invent or guess a real secret value. If an existing definition shows a sensitive value as "${ENV_SECRET_SENTINEL}", that's a stored secret — keep it as the literal "${ENV_SECRET_SENTINEL}" when revising, don't replace or guess its value.

Example:
  name: OPENAI_API_KEY
  value: "${ENV_PLACEHOLDER_SENTINEL}"
  sensitive: true`
  ),
  sensitive: z.boolean().optional().describe("Mark true for credentials (API keys, tokens)."),
});

export type AgentEnvVar = z.infer<typeof AgentEnvVarSchema>;

export const EnvSchema = z
  .array(AgentEnvVarSchema)
  .max(20)
  .optional()
  .describe("Environment variables the agent needs. Credentials must be marked sensitive.");

export type Env = z.infer<typeof EnvSchema>;

export const WorkspaceFilesSchema = z.record(z.string(), z.string()).optional();

export type WorkspaceFiles = z.infer<typeof WorkspaceFilesSchema>;

export const SkillSchema = z
  .string()
  .min(1)
  .max(128, "Skill exceeds maximum length of 128 characters")
  .regex(
    /^[a-zA-Z0-9@\-_/.:]+$/,
    "Skill contains invalid characters. Allowed: alphanumeric, -, _, /, ., @"
  )
  .refine((s) => s !== "npm:" && s !== "pack:", "Skill cannot be a bare prefix");

export type Skill = string;

export const SkillsSchema = z
  .array(SkillSchema)
  .max(20)
  .optional()
  .describe("Skill identifiers to install.");

export type Skills = z.infer<typeof SkillsSchema>;

export const PluginsSchema = z
  .array(z.string())
  .max(20)
  .optional()
  .describe("Plugin identifiers to install.");

export type Plugins = z.infer<typeof PluginsSchema>;

export const StorageSchema = z
  .object({
    enabled: z.boolean().default(true),
    size: z.string().min(1),
    storageClass: z.string().optional(),
  })
  .optional();

export type Storage = z.infer<typeof StorageSchema>;

export const SelfConfigActionSchema = z.enum(["skills", "config", "soul"]);

export type SelfConfigAction = z.infer<typeof SelfConfigActionSchema>;

export const SelfConfigureSchema = z
  .object({
    enabled: z.boolean().default(false).optional(),
    allowedActions: z.array(SelfConfigActionSchema).max(4).optional(),
  })
  .optional();

export type SelfConfigure = z.infer<typeof SelfConfigureSchema>;

// Also used as the LLM structured-output schema for agent config generation:
// the .describe() texts guide the model.
export const AgentInputObjectSchema = z.object({
  name: z.string().optional().describe("Short human-readable agent name."),
  description: z
    .string()
    .optional()
    .describe("One or two sentences describing what the agent does."),
  type: z.string().optional().describe("Agent type key from the configured agent types."),
  soul: z
    .string()
    .optional()
    .describe(
      `Primary identity — the first thing in the system prompt, defining who the agent is. 

# What should go in SOUL.md?
Use it for durable voice and personality guidance, such as:
- tone
- communication style
- level of directness
- default interaction style
- what to avoid stylistically
- how Hermes should handle uncertainty, disagreement, or ambiguity

# Example for "review GitHub pull requests":
  # Personality
  You are a pragmatic senior code reviewer with strong taste.
  You optimize for correctness and clarity over politeness theater.
      
  ## Style
  - Be direct without being cold
  - Push back when a change is risky
  - Admit uncertainty plainly
  - Keep feedback compact unless depth is useful
      
  ## What to avoid
  - Sycophancy and hype language
  - Repeating the user's framing if it's wrong
  - Overexplaining obvious things`
    ),
  config: ConfigSchema,
  env: EnvSchema,
  skills: SkillsSchema,
  plugins: PluginsSchema,
  sharedEnvSets: z
    .array(z.string())
    .optional()
    .describe("Ids of dashboard-managed shared env sets."),
});

export const AgentInputSchema = AgentInputObjectSchema.superRefine((data, ctx) => {
  const requireSensitiveEnv = (name: string, enabledPath: string) => {
    const hasVar = data.env?.some((v) => v.name === name && v.sensitive === true);
    if (!hasVar) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Env var "${name}" (sensitive) is required when ${enabledPath} is true.`,
        path: ["env"],
      });
    }
  };
  if (data.config?.platforms?.webhook?.enabled === true) {
    requireSensitiveEnv("WEBHOOK_SECRET", "config.platforms.webhook.enabled");
  }
  if (data.config?.api_server?.enabled === true) {
    requireSensitiveEnv("API_SERVER_KEY", "config.api_server.enabled");
  }

  data.env?.forEach((v, i) => {
    if (v.value === ENV_PLACEHOLDER_SENTINEL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Env var "${v.name}" still has the placeholder value ` +
          `"${ENV_PLACEHOLDER_SENTINEL}" — replace it with a real value.`,
        path: ["env", i, "value"],
      });
    }
  });
});

export type AgentInput = z.infer<typeof AgentInputSchema>;

export const AgentPhaseSchema = z.enum([
  "Pending",
  "Running",
  "Succeeded",
  "Failed",
  "Unknown",
  "Suspended",
]);
export type AgentPhase = z.infer<typeof AgentPhaseSchema>;

export const AgentSchema = AgentInputObjectSchema.extend({
  id: z.string().min(1),
  userId: z.string().min(1),
  suspended: z.boolean().optional(),
  archived: z.boolean().optional(),
  phase: AgentPhaseSchema.optional(),
  createdAt: z.date().optional(),
}).readonly();

export type Agent = z.infer<typeof AgentSchema>;
