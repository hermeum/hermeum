import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks
// Full field semantics: docs/hermes-config/webhooks.md
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
  .object({
    chat_id: z.string().optional().describe("Destination chat/channel id."),
    repo: z.string().optional().describe('Repository in "owner/repo" form.'),
    pr_number: z.string().optional().describe("PR/issue number to comment on."),
  })
  .optional()
  .describe("Platform-specific delivery options.");

export type DeliverExtra = z.infer<typeof DeliverExtraSchema>;

export const WebhookRouteSchema = z
  .object({
    events: z.array(z.string()).optional().describe("Event types this route accepts."),
    prompt: z
      .string()
      .optional()
      .describe("Prompt template with {dot.notation} payload access."),
    skills: z.array(z.string()).optional().describe("Skill names to load for this route."),
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
  .object({
    enabled: z.boolean().optional().describe("Whether the webhook server is enabled."),
    extra: z
      .object({
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

export const PlatformsSchema = z
  .looseObject({
    webhook: WebhookSchema,
  })
  .optional()
  .describe("Messaging platform integrations.");

export type Platforms = z.infer<typeof PlatformsSchema>;