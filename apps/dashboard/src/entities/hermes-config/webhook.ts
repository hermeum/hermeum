import { z } from "zod";

// Only the fields the dashboard reads (isWebhookEnabled / getWebhookPort in
// entities/agent.ts) are typed here; everything else passes through as a loose
// field. Full field semantics live in docs/hermes-config/webhooks.md and are
// surfaced to the LLM via the readDocument tool.
export const WebhookConfigSchema = z
  .looseObject({
    enabled: z.boolean().optional(),
    extra: z
      .looseObject({
        port: z.number().int().optional(),
      })
      .optional(),
  })
  .optional();

export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

export const PlatformsConfigSchema = z
  .looseObject({
    webhook: WebhookConfigSchema,
  })
  .optional();

export type PlatformsConfig = z.infer<typeof PlatformsConfigSchema>;