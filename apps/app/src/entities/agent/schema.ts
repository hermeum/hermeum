import { z } from "zod";

import { ConfigSchema } from "../hermes-config";
import { EnvVarSchema } from "../shared-env-set";
import { AgentTypeKeySchema } from "../agent-type";
import {
  SkillIdentifiersSchema,
  SkillIdentifier,
} from "../skill";

import { isApiServerEnabled, isTeamsEnabled, isWebhookEnabled } from "./platform";

export const ENV_SECRET_SENTINEL = "<secret>";

export const ENV_PLACEHOLDER_SENTINEL = "<fill-me>";

export const AgentEnvVarSchema = EnvVarSchema.extend({
  value: z.string().describe(
    `An environment variable value.

# Placeholders
- "${ENV_PLACEHOLDER_SENTINEL}": A placeholder for a value that needs to be filled in by the user.
- "${ENV_SECRET_SENTINEL}": A sentinel value indicating an existing secret. \
It will be replaced with the actual secret value when the agent is deployed, \
but should not be used in new definitions.

Example:
  name: OPENAI_API_KEY
  value: "sk-proj-XXXXX"
  sensitive: true`
  ),
  sensitive: z.boolean().optional().describe("Mark true for credentials (API keys, tokens)."),
}).describe("An agent environment variable.");

export type AgentEnvVar = z.infer<typeof AgentEnvVarSchema>;

export const EnvSchema = z
  .array(AgentEnvVarSchema)
  .max(20)
  .optional()
  .describe("Environment variables the agent needs.");

export type Env = z.infer<typeof EnvSchema>;

export const SoulSchema = z
  .string()
  .optional()
  .describe(
    `Primary identity — the first thing in the system prompt, defining who the agent is.

Choose whatever shape fits the request — a plain paragraph, a couple of
bullets, or short markdown sections based on agent functionality. 
A simple agent deserves a one- or two-sentence soul; only reach for sections when
there's a genuinely separate set of points to make (e.g. tone vs. things to
avoid). 

Use it for durable voice and personality guidance only — not task-specific
instructions (those belong elsewhere in the config).

# Example — simple request ("summarize documents I paste in"):
  You are a precise, neutral summarizer. Prioritize completeness over brevity
  when the two conflict, and never editorialize.

# Example — request with more to say ("review GitHub pull requests"):
  # Personality
  You are a pragmatic senior engineer with strong taste.

  ## Style
  - Be direct without being cold
  - Prefer substance over filler
  - Push back when something is a bad idea

  ## What to avoid
  - Sycophancy
  - Hype language
  - Repeating the user's framing if it's wrong
  - Overexplaining obvious things

  ## Technical posture
  - Prefer simple systems over clever systems
  - Care about operational reality, not idealized architecture`
  );

export type Soul = z.infer<typeof SoulSchema>;

export type Skill = SkillIdentifier;

export const PluginsSchema = z
  .array(z.string())
  .max(20)
  .optional()
  .describe("Plugin identifiers to install.");

export type Plugins = z.infer<typeof PluginsSchema>;

export const PipPackageSchema = z
  .string()
  .min(1)
  .max(128, "Package specifier exceeds maximum length of 128 characters")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9,_-]+\])?([<>=!~]=?[A-Za-z0-9.*+]+(,[<>=!~]=?[A-Za-z0-9.*+]+)*)?$/,
    "Invalid pip package specifier. Expected a name, optionally followed by extras and a " +
      'version constraint, e.g. "requests" or "pandas==2.1.0".'
  );

export type PipPackage = z.infer<typeof PipPackageSchema>;

export const NpmPackageSchema = z
  .string()
  .min(1)
  .max(128, "Package specifier exceeds maximum length of 128 characters")
  .regex(
    /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(@[A-Za-z0-9^~.*+<>=-]+)?$/,
    "Invalid npm package specifier. Expected a name, optionally scoped and followed by a " +
      'version, e.g. "typescript" or "@anthropic-ai/sdk@^1.0.0".'
  );

export type NpmPackage = z.infer<typeof NpmPackageSchema>;

export const PackagesSchema = z
  .object({
    pip: z
      .array(PipPackageSchema)
      .max(50)
      .optional()
      .describe(
        'Python package specifiers to install via `uv pip install` (e.g. "requests", "pandas==2.1.0").'
      ),
    npm: z
      .array(NpmPackageSchema)
      .max(50)
      .optional()
      .describe(
        'npm package specifiers to install via `npm install` (e.g. "@anthropic-ai/sdk", "typescript@^5.0.0").'
      ),
  })
  .optional()
  .describe("Python and npm packages to pre-install before the agent starts.");

export type Packages = z.infer<typeof PackagesSchema>;

// https://hermes-agent.nousresearch.com/docs/user-guide/features/cron#schedule-formats
// Relative delay ("30m", "2h", "1d") | interval ("every 30m") |
// 5-field cron expression ("0 9 * * *") | ISO timestamp ("2026-03-15T09:00:00")
const CRON_SCHEDULE_PATTERN =
  /^\d+[mhd]$|^every \d+[mhd]$|^[0-9*/,-]+(?:\s+[0-9*/,-]+){4}$|^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

export const CronScheduleSchema = z
  .string()
  .regex(
    CRON_SCHEDULE_PATTERN,
    'Schedule must be a relative delay ("30m", "2h", "1d"), an interval ("every 30m"), ' +
      'a 5-field cron expression ("0 9 * * *"), or an ISO timestamp ("2026-03-15T09:00:00").'
  )
  .describe(
    `When to run this cron.

- Relative delay (one-shot): "30m", "2h", "1d"
- Interval (recurring): "every 30m", "every 2h", "every 1d"
- Cron expression (5-field): "0 9 * * *" (daily at 9am), "0 */6 * * *" (every 6 hours)
- ISO timestamp (one-time): "2026-03-15T09:00:00"`
  );

export type CronSchedule = z.infer<typeof CronScheduleSchema>;

// https://hermes-agent.nousresearch.com/docs/user-guide/features/cron#delivery-options
const CRON_DELIVER_PLATFORMS = [
  "origin",
  "local",
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "matrix",
  "mattermost",
  "email",
  "sms",
  "homeassistant",
  "dingtalk",
  "feishu",
  "wecom",
  "weixin",
  "bluebubbles",
  "qqbot",
  "all",
] as const;

// Only the platform prefix is validated — anything after ":" (a chat id, channel
// name, or topic) is passed through as-is.
function isKnownCronDeliverPlatform(target: string): boolean {
  const platform = target.split(":")[0] ?? "";
  return (CRON_DELIVER_PLATFORMS as readonly string[]).includes(platform);
}

export const CronDeliverSchema = z
  .string()
  .refine((value) => value.split(",").every(isKnownCronDeliverPlatform), {
    message:
      `Deliver must be one of ${CRON_DELIVER_PLATFORMS.join(", ")}, optionally with a ` +
      '":target" suffix (e.g. "telegram:123456"), or a comma-separated list of these ' +
      '(e.g. "telegram,discord").',
  })
  .optional()
  .describe(
    `Where to send the cron's output.

- "origin": back to the source that created the cron.
- "local": save to ~/.hermes/cron/output/.
- "all": fan out to every connected home channel.
- A platform home channel: "telegram", "discord", "slack", "whatsapp", "signal", "matrix", \
"mattermost", "email", "sms", "homeassistant", "dingtalk", "feishu", "wecom", "weixin", \
"bluebubbles", "qqbot".
- A specific target: "telegram:123456", "discord:#engineering" (not validated further).
- Comma-separated fan-out: "telegram,discord".`
  );

export type CronDeliver = z.infer<typeof CronDeliverSchema>;

export const AgentCronSchema = z
  .object({
    name: z.string().min(1).describe("Cron job name."),
    schedule: CronScheduleSchema,
    prompt: z.string().min(1).describe("Prompt to run when this cron triggers."),
    deliver: CronDeliverSchema,
    repeat: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Number of times to repeat the run. Omit to run once per trigger."),
    skills: z.array(z.string()).optional().describe("Skill names to load for this cron's run."),
  })
  .describe(
    `A scheduled cron job that triggers an agent run.

Example — daily standup summary:
  name: daily-standup
  schedule: "0 9 * * *"
  prompt: Summarize yesterday's activity across tracked repos.
  deliver: slack`
  );

export type AgentCron = z.infer<typeof AgentCronSchema>;

export const CronsSchema = z
  .array(AgentCronSchema)
  .max(20)
  .optional()
  .describe("Scheduled cron jobs for the agent.");

export type Crons = z.infer<typeof CronsSchema>;

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
  type: AgentTypeKeySchema.optional().describe("Agent type key from the configured agent types."),
  soul: SoulSchema,
  config: ConfigSchema,
  env: EnvSchema,
  skills: SkillIdentifiersSchema,
  plugins: PluginsSchema,
  packages: PackagesSchema,
  crons: CronsSchema,
  sharedEnvSets: z
    .array(z.string())
    .optional()
    .describe("Ids of app-managed shared env sets."),
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
  if (isWebhookEnabled(data)) {
    requireSensitiveEnv("WEBHOOK_SECRET", "webhook enabled (env var or config)");
  }
  if (isApiServerEnabled(data)) {
    requireSensitiveEnv("API_SERVER_KEY", "env.API_SERVER_ENABLED");
  }
  if (isTeamsEnabled(data)) {
    requireSensitiveEnv("TEAMS_CLIENT_SECRET", "teams enabled (env var or config)");
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
  reason: z.string().optional(),
  // Public base URL of the agent's ingress. Output-only; null when no ingress.
  endpoint: z.string().url().nullable().optional(),
  createdAt: z.date().optional(),
}).readonly();

export type Agent = z.infer<typeof AgentSchema>;
