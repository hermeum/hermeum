import { z } from "zod";

import { SecretRefSchema } from "./shared";

// https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks
// Full field semantics: docs/official/webhooks.md
//
// Adapter settings (secret, port, ...) are valid directly under
// platforms.webhook: as well as under extra: (upstream: both spellings reach
// the adapter; a value nested under extra: wins if the same key appears in
// both). secret is optional — Hermeum surfaces it as a ${VAR} reference.
//
// Skipped on purpose: route fields filters and script are not typed here —
// they are operator-level concerns and pass through via looseObject.
export const WebhookDeliverSchema = z
  .enum([
    "log",
    "github_comment",
    "telegram",
    "discord",
    "slack",
    "signal",
    "sms",
    "whatsapp",
    "matrix",
    "mattermost",
    "homeassistant",
    "email",
    "dingtalk",
    "feishu",
    "wecom",
    "weixin",
    "bluebubbles",
    "qqbot",
  ])
  .optional()
  .describe("Where to send the response.");

export type WebhookDeliver = z.infer<typeof WebhookDeliverSchema>;

export const DeliverExtraSchema = z
  .looseObject({
    chat_id: z.string().optional().describe("Destination chat/channel id."),
    repo: z.string().optional().describe('Repository in "owner/repo" form.'),
    pr_number: z.string().optional().describe("PR/issue number to comment on."),
  })
  .optional()
  .describe("Platform-specific delivery options.");

export type DeliverExtra = z.infer<typeof DeliverExtraSchema>;

// Toolset keys accepted in a route's `toolsets` list — the snake_case names
// Hermes' toolset validation resolves (hermes_cli/tools_config.py
// CONFIGURABLE_TOOLSETS, minus config-only `stt`). Upstream drops unknown
// names and platform-restricted toolsets (discord, discord_admin) rather
// than erroring; some keys (homeassistant, spotify, yuanbao, computer_use)
// cannot work in Hermeum but are accepted to mirror upstream.
export const WebhookRouteToolsetSchema = z
  .enum([
    "web",
    "browser",
    "terminal",
    "file",
    "code_execution",
    "vision",
    "video",
    "image_gen",
    "video_gen",
    "x_search",
    "tts",
    "skills",
    "todo",
    "memory",
    "context_engine",
    "session_search",
    "clarify",
    "delegation",
    "cronjob",
    "homeassistant",
    "spotify",
    "discord",
    "discord_admin",
    "yuanbao",
    "computer_use",
  ])
  .describe("A toolset key enabled for runs triggered by this route.");

export type WebhookRouteToolset = z.infer<typeof WebhookRouteToolsetSchema>;

export const WebhookRouteSchema = z
  .looseObject({
    events: z.array(z.string()).optional().describe("Event types this route accepts."),
    secret: SecretRefSchema.optional().describe(
      "HMAC secret for this route. Falls back to the global " +
        "platforms.webhook.secret when omitted."
    ),
    prompt: z
      .string()
      .optional()
      .describe("Prompt template with {dot.notation} payload access."),
    skills: z.array(z.string()).optional().describe("Skill names to load for this route."),
    toolsets: z
      .array(WebhookRouteToolsetSchema)
      .optional()
      .describe(
        "Toolsets enabled for runs triggered by this route. REPLACES the " +
          "platform-level webhook toolset for this route only; when omitted, " +
          "runs use the constrained webhook default. Grant elevated toolsets " +
          "only to fully-trusted senders, for what the route's task needs."
      ),
    deliver: WebhookDeliverSchema,
    deliver_extra: DeliverExtraSchema,
    deliver_only: z
      .boolean()
      .optional()
      .describe("Skip the agent and deliver the rendered prompt as a literal message."),
  })
  .describe("A named webhook route.");

export type WebhookRoute = z.infer<typeof WebhookRouteSchema>;

export const WebhookSchema = z
  .looseObject({
    enabled: z.boolean().optional().describe("Whether the webhook server is enabled."),
    secret: SecretRefSchema.describe(
      "Global HMAC secret used for signature validation on all routes " +
        "(per-route secret overrides it)."
    ).optional(),
    extra: z
      .looseObject({
        port: z.number().int().optional().describe("Webhook server port."),
        rate_limit: z.number().optional().describe("Max requests per minute."),
        max_body_bytes: z.number().optional().describe("Max request body size in bytes."),
        routes: z
          .record(z.string(), WebhookRouteSchema)
          .optional()
          .describe("Named webhook routes keyed by route name."),
      })
      .optional()
      .describe("Webhook server settings."),
  })
  .optional()
  .describe("Webhook platform configuration.");

export type Webhook = z.infer<typeof WebhookSchema>;