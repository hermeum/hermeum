import { z } from "zod";

import { ConfigSchema } from "./hermes-config";
import { EnvVarSchema } from "./shared-env-set";

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

// https://hermes-agent.nousresearch.com/docs/user-guide/features/skills#supported-hub-sources
const SKILL_SOURCE_PREFIXES = [
  "official/",
  "skills-sh/",
  "browse-sh/",
  "clawhub/",
  "lobehub/",
  "claude-marketplace/",
] as const;

const SKILL_NAMESPACE_PREFIXES = ["npm:", "pack:"] as const;

const SIMPLE_SLUG_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const PATH_SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateSkillIdentifier(s: string, ctx: z.RefinementCtx): void {
  if (s.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Skill identifier cannot be empty.",
      path: [],
    });
    return;
  }

  // Prefixed namespace forms: "npm:@scope/pkg", "pack:./local/skill"
  const nsPrefix = SKILL_NAMESPACE_PREFIXES.find((p) => s.startsWith(p));
  if (nsPrefix !== undefined) {
    const rest = s.slice(nsPrefix.length);
    if (rest.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Skill cannot be a bare "${nsPrefix}" prefix — a package identifier must follow.`,
        path: [],
      });
    } else if (!/^[^\s]+$/.test(rest)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Skill "${s}" has whitespace in the package specifier after "${nsPrefix}".`,
        path: [],
      });
    }
    return;
  }

  // URL form: "well-known:<url>" or a bare http(s) URL
  if (s.startsWith("well-known:")) {
    const rest = s.slice("well-known:".length);
    if (!isHttpUrl(rest)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'well-known: skills must be followed by a valid http(s) URL, e.g. ' +
          '"well-known:https://mintlify.com/docs/.well-known/skills/mintlify".',
        path: [],
      });
    }
    return;
  }

  if (s.startsWith("http://") || s.startsWith("https://")) {
    if (!isHttpUrl(s)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Direct-URL skills must be valid http(s) URLs.",
        path: [],
      });
    }
    return;
  }

  // Source-prefixed path forms: "official/...", "skills-sh/...", etc.
  const srcPrefix = SKILL_SOURCE_PREFIXES.find((p) => s.startsWith(p));
  if (srcPrefix !== undefined) {
    const rest = s.slice(srcPrefix.length);
    if (rest.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Skill cannot be a bare "${srcPrefix}" prefix — at least two path segments must follow, ` +
          `e.g. "${srcPrefix}category/skill-name".`,
        path: [],
      });
      return;
    }
    const segments = rest.split("/");
    if (segments.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Skill "${s}" needs at least two path segments after "${srcPrefix}", ` +
          `e.g. "${srcPrefix}category/skill-name".`,
        path: [],
      });
      return;
    }
    const bad = segments.find((seg) => !PATH_SEGMENT_RE.test(seg));
    if (bad !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Skill "${s}" has an invalid path segment "${bad}" after "${srcPrefix}". ` +
          'Segments must start with an alphanumeric character and may contain alphanumerics, ".", "-", and "_".',
        path: [],
      });
    }
    return;
  }

  // GitHub-style path: "owner/repo/..." — ≥2 non-empty segments
  if (s.includes("/")) {
    if (s.startsWith("/") || s.endsWith("/")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Skill paths must not start or end with "/", e.g. "openai/skills/k8s".',
        path: [],
      });
      return;
    }
    const segments = s.split("/");
    const bad = segments.find((seg) => !PATH_SEGMENT_RE.test(seg));
    if (bad !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `Skill "${s}" has an invalid path segment "${bad}". ` +
          'Segments must start with an alphanumeric character and may contain alphanumerics, ".", "-", and "_".',
        path: [],
      });
      return;
    }
    // ≥2 well-formed segments is a valid GitHub-style install path
    return;
  }

  // Simple slug — the only no-slash form we accept
  if (SIMPLE_SLUG_RE.test(s)) return;

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message:
      `Skill "${s}" is not a recognized identifier format. Expected a simple slug ("axolotl"), ` +
      'a namespace prefix ("npm:@scope/pkg"), a hub-source path ("official/category/skill-name", ' +
      '"skills-sh/owner/repo/skill", "browse-sh/host/task-id"), a GitHub path ("openai/skills/k8s"), ' +
      'a well-known endpoint ("well-known:https://example.com/.well-known/skills/x"), or a direct URL ' +
      '("https://example.com/SKILL.md").',
    path: [],
  });
}

export const SkillSchema = z
  .string()
  .min(1)
  .max(128, "Skill exceeds maximum length of 128 characters")
  .superRefine(validateSkillIdentifier);

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
  type: z.string().optional().describe("Agent type key from the configured agent types."),
  soul: SoulSchema,
  config: ConfigSchema,
  env: EnvSchema,
  skills: SkillsSchema,
  plugins: PluginsSchema,
  packages: PackagesSchema,
  crons: CronsSchema,
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
  if (isWebhookEnabled(data)) {
    requireSensitiveEnv("WEBHOOK_SECRET", "webhook enabled (env var or config)");
  }
  if (isApiServerEnabled(data)) {
    requireSensitiveEnv("API_SERVER_KEY", "env.API_SERVER_ENABLED");
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

// API server settings are configured exclusively via env vars (see
// docs/hermes-config/api-server.md). These helpers read those env vars off an
// `AgentInput`.
const API_SERVER_DEFAULT_PORT = 8642;

export function isApiServerEnabled(input: AgentInput): boolean {
  return (
    input.env?.some(
      (v) => v.name === "API_SERVER_ENABLED" && v.value.toLowerCase() === "true"
    ) ?? false
  );
}

export function getApiServerPort(input: AgentInput): number {
  const raw = input.env?.find((v) => v.name === "API_SERVER_PORT")?.value;
  if (raw === undefined || raw.trim() === "") return API_SERVER_DEFAULT_PORT;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : API_SERVER_DEFAULT_PORT;
}

// Webhook settings can be configured via config.yaml
// (config.platforms.webhook.enabled / extra.port) or via env vars
// (WEBHOOK_ENABLED / WEBHOOK_PORT). config.yaml is preferred and takes
// precedence over the env vars; the env vars act as a fallback when the
// corresponding config field is absent.
const WEBHOOK_DEFAULT_PORT = 8644;

export function isWebhookEnabled(input: AgentInput): boolean {
  const configEnabled = input.config?.platforms?.webhook?.enabled;
  if (configEnabled !== undefined) return configEnabled;
  return (
    input.env?.some(
      (v) => v.name === "WEBHOOK_ENABLED" && v.value.toLowerCase() === "true",
    ) ?? false
  );
}

export function getWebhookPort(input: AgentInput): number {
  const configPort = input.config?.platforms?.webhook?.extra?.port;
  if (configPort !== undefined) return configPort;
  const envRaw = input.env?.find((v) => v.name === "WEBHOOK_PORT")?.value;
  if (envRaw !== undefined && envRaw.trim() !== "") {
    const n = Number(envRaw);
    return Number.isInteger(n) && n > 0 ? n : WEBHOOK_DEFAULT_PORT;
  }
  return WEBHOOK_DEFAULT_PORT;
}

// Message-platform availability — a derived, read-only view of which inbound
// message platforms are wired up for an agent, computed from its config + env.
// Not persisted.
// https://hermes-agent.nousresearch.com/docs/user-guide/messaging

export enum PlatformId {
  ApiServer = "api-server",
  Webhook = "webhook",
  Slack = "slack",
}

export interface PlatformAvailability {
  status: "available" | "unavailable";
  /** Short explanation shown when status is not "available". */
  reason?: string;
  /** Listening port for HTTP platforms (api-server, webhook). */
  port?: number;
  /** Home channel for chat platforms (slack only), if configured. */
  home?: string;
}

interface PlatformMeta {
  label: string;
  description: string;
}

const PLATFORM_META: Record<PlatformId, PlatformMeta> = {
  [PlatformId.ApiServer]: {
    label: "API Server",
    description: "OpenAI-compatible HTTP endpoint for frontends like Open WebUI.",
  },
  [PlatformId.Webhook]: {
    label: "Webhook",
    description: "HTTP server that accepts signed webhooks and routes them to the agent.",
  },
  [PlatformId.Slack]: {
    label: "Slack",
    description: "Slack bot relayed through the gateway (Socket Mode).",
  },
};

export function getPlatformLabel(id: PlatformId): string {
  return PLATFORM_META[id].label;
}

export function getPlatformDescription(id: PlatformId): string {
  return PLATFORM_META[id].description;
}

/** Ordered platform list for UI rendering. */
export const PLATFORM_IDS: readonly PlatformId[] = [
  PlatformId.ApiServer,
  PlatformId.Webhook,
  PlatformId.Slack,
];

const SLACK_REQUIRED_ENV_VARS = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SLACK_ALLOWED_USERS"];

export function derivePlatformAvailability(id: PlatformId, agent: Agent): PlatformAvailability {
  const env = agent.env ?? [];

  switch (id) {
    case PlatformId.ApiServer: {
      if (!isApiServerEnabled(agent)) {
        return { status: "unavailable", reason: "Set API_SERVER_ENABLED=true to enable." };
      }
      return { status: "available", port: getApiServerPort(agent) };
    }
    case PlatformId.Webhook: {
      if (!isWebhookEnabled(agent)) {
        return {
          status: "unavailable",
          reason: "Set WEBHOOK_ENABLED=true (or config.platforms.webhook.enabled).",
        };
      }
      return { status: "available", port: getWebhookPort(agent) };
    }
    case PlatformId.Slack: {
      const isSet = (name: string) =>
        env.some((v) => v.name === name && v.value.trim() !== "");
      const missing = SLACK_REQUIRED_ENV_VARS.filter((name) => !isSet(name));
      if (missing.length > 0) {
        return {
          status: "unavailable",
          reason: `Missing env var${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
        };
      }
      const home = env.find((v) => v.name === "SLACK_HOME_CHANNEL")?.value;
      const homeName = env.find((v) => v.name === "SLACK_HOME_CHANNEL_NAME")?.value;
      if (home) {
        return { status: "available", home: homeName ? `${home} (${homeName})` : home };
      }
      return { status: "available" };
    }
  }
}

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

// Toolset availability — a derived, read-only view of which Hermes toolsets
// are usable for an agent, computed from its config + env. Not persisted.
// https://hermes-agent.nousresearch.com/docs/user-guide/features/tools
//
// The catalog mirrors Hermes' CONFIGURABLE_TOOLSETS
// (vendor/hermes-agent/hermes_cli/tools_config.py): the 25 built-in toolsets
// in the same order. Plugin toolsets and platform-native toolsets outside
// CONFIGURABLE_TOOLSETS are not listed here.

export enum ToolsetId {
  Web = "web",
  Browser = "browser",
  Terminal = "terminal",
  File = "file",
  CodeExecution = "codeExecution",
  Vision = "vision",
  Video = "video",
  ImageGen = "imageGen",
  VideoGen = "videoGen",
  XSearch = "xSearch",
  Tts = "tts",
  Skills = "skills",
  Todo = "todo",
  Memory = "memory",
  ContextEngine = "contextEngine",
  SessionSearch = "sessionSearch",
  Clarify = "clarify",
  Delegation = "delegation",
  Cronjob = "cronjob",
  HomeAssistant = "homeAssistant",
  Spotify = "spotify",
  Discord = "discord",
  DiscordAdmin = "discordAdmin",
  Yuanbao = "yuanbao",
  ComputerUse = "computerUse",
}

export type ToolsetStatus = "available" | "unavailable";

export interface ToolsetAvailability {
  status: ToolsetStatus;
  /** Short explanation shown when status is not "available". */
  reason?: string;
}

interface ToolsetMeta {
  label: string;
  description: string;
}

const TOOLSET_META: Record<ToolsetId, ToolsetMeta> = {
  [ToolsetId.Web]: {
    label: "Web",
    description: "Search the web and extract page content.",
  },
  [ToolsetId.Browser]: {
    label: "Browser",
    description: "Interactive browser automation.",
  },
  [ToolsetId.Terminal]: {
    label: "Terminal",
    description: "Execute shell commands.",
  },
  [ToolsetId.File]: {
    label: "File",
    description: "Read, edit, and search files.",
  },
  [ToolsetId.CodeExecution]: {
    label: "Code Execution",
    description: "Run code in an isolated sandbox.",
  },
  [ToolsetId.Vision]: {
    label: "Vision",
    description: "Analyze images with a vision-capable model.",
  },
  [ToolsetId.Video]: {
    label: "Video",
    description: "Analyze video with a video-capable model.",
  },
  [ToolsetId.ImageGen]: {
    label: "Image Generation",
    description: "Generate images from text prompts.",
  },
  [ToolsetId.VideoGen]: {
    label: "Video Generation",
    description: "Generate video from text, image, or reference input.",
  },
  [ToolsetId.XSearch]: {
    label: "X Search",
    description: "Search X (Twitter) posts via xAI.",
  },
  [ToolsetId.Tts]: {
    label: "Text-to-Speech",
    description: "Convert text to spoken audio.",
  },
  [ToolsetId.Skills]: {
    label: "Skills",
    description: "List, view, and manage installed skills.",
  },
  [ToolsetId.Todo]: {
    label: "Todo",
    description: "Track and plan tasks within a conversation.",
  },
  [ToolsetId.Memory]: {
    label: "Memory",
    description: "Persistent memory and recall across sessions.",
  },
  [ToolsetId.ContextEngine]: {
    label: "Context Engine",
    description: "Runtime tools from the active context engine.",
  },
  [ToolsetId.SessionSearch]: {
    label: "Session Search",
    description: "Search past conversation sessions.",
  },
  [ToolsetId.Clarify]: {
    label: "Clarify",
    description: "Ask the user clarifying questions.",
  },
  [ToolsetId.Delegation]: {
    label: "Delegation",
    description: "Delegate tasks to subagents.",
  },
  [ToolsetId.Cronjob]: {
    label: "Cron",
    description: "Schedule and manage recurring jobs.",
  },
  [ToolsetId.HomeAssistant]: {
    label: "Home Assistant",
    description: "Control smart home devices via Home Assistant.",
  },
  [ToolsetId.Spotify]: {
    label: "Spotify",
    description: "Control Spotify playback, playlists, and library.",
  },
  [ToolsetId.Discord]: {
    label: "Discord",
    description: "Read and participate in Discord channels.",
  },
  [ToolsetId.DiscordAdmin]: {
    label: "Discord Admin",
    description: "Administer Discord servers: channels, roles, pins.",
  },
  [ToolsetId.Yuanbao]: {
    label: "Yuanbao",
    description: "Query Yuanbao groups, members, and DMs.",
  },
  [ToolsetId.ComputerUse]: {
    label: "Computer Use",
    description: "Drive the desktop via cua-driver on macOS, Windows, or Linux.",
  },
};

export function getToolsetLabel(id: ToolsetId): string {
  return TOOLSET_META[id].label;
}

export function getToolsetDescription(id: ToolsetId): string {
  return TOOLSET_META[id].description;
}

/** Ordered toolset list for UI rendering. Mirrors CONFIGURABLE_TOOLSETS order. */
export const TOOLSET_IDS: readonly ToolsetId[] = [
  ToolsetId.Web,
  ToolsetId.Browser,
  ToolsetId.Terminal,
  ToolsetId.File,
  ToolsetId.CodeExecution,
  ToolsetId.Vision,
  ToolsetId.Video,
  ToolsetId.ImageGen,
  ToolsetId.VideoGen,
  ToolsetId.XSearch,
  ToolsetId.Tts,
  ToolsetId.Skills,
  ToolsetId.Todo,
  ToolsetId.Memory,
  ToolsetId.ContextEngine,
  ToolsetId.SessionSearch,
  ToolsetId.Clarify,
  ToolsetId.Delegation,
  ToolsetId.Cronjob,
  ToolsetId.HomeAssistant,
  ToolsetId.Spotify,
  ToolsetId.Discord,
  ToolsetId.DiscordAdmin,
  ToolsetId.Yuanbao,
  ToolsetId.ComputerUse,
];

export function deriveToolsetAvailability(id: ToolsetId, agent: Agent): ToolsetAvailability {
  const config = agent.config;
  const env = agent.env ?? [];

  switch (id) {
    case ToolsetId.Web: {
      const hasBackend = !!(
        config?.web?.backend ??
        config?.web?.search_backend ??
        config?.web?.extract_backend
      );
      return hasBackend
        ? { status: "available" }
        : { status: "unavailable", reason: "No web backend configured." };
    }
    case ToolsetId.XSearch: {
      // Gated on xAI credentials; off by default.
      const hasXaiKey = env.some((v) => v.name === "XAI_API_KEY" && v.value.trim() !== "");
      const xaiBackend = config?.web?.search_backend === "xai";
      return hasXaiKey || xaiBackend
        ? { status: "available" }
        : {
            status: "unavailable",
            reason: "Set XAI_API_KEY to opt in.",
          };
    }
    case ToolsetId.Browser: {
      return config?.browser?.cloud_provider
        ? { status: "available" }
        : { status: "unavailable", reason: "No browser provider configured." };
    }
    default:
      // Toolsets with no config gate in Hermeum. They are available whenever
      // the agent exists; per-agent toggling is a follow-up.
      return { status: "available" };
  }
}
