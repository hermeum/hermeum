// Hermes agent config schema.
//
// Only well-known fields are typed here (see the per-field modules below); any
// additional fields pass through unchanged via looseObject. Full field
// semantics live in docs/hermes-config/ and are surfaced to the LLM via the
// readDocument tool, so .describe() texts are kept minimal — use the
// `readDocument` tool to look up the semantics of any config field you are not
// fully sure about before writing it into the draft.

export { ModelProviderSchema, ModelSchema, type ModelProvider, type Model } from "./model";
export {
  WebhookDeliverSchema,
  DeliverExtraSchema,
  WebhookRouteSchema,
  WebhookSchema,
  type WebhookDeliver,
  type DeliverExtra,
  type WebhookRoute,
  type Webhook,
} from "./webhook";
export { TeamsSchema, type Teams } from "./teams";
export { ApiServerSchema, type ApiServer } from "./api-server";
export { SlackSchema, ChannelSkillBindingSchema, type Slack, type ChannelSkillBinding } from "./slack";
export { DiscordSchema, type Discord } from "./discord";
export {
  WebSearchBackendSchema,
  WebExtractBackendSchema,
  WebSchema,
  type WebSearchBackend,
  type WebExtractBackend,
  type Web,
} from "./web";
export { BrowserCloudProviderSchema, BrowserSchema, type BrowserCloudProvider, type Browser } from "./browser";
export { XSearchSchema, type XSearch } from "./x-search";
export { ImageGenSchema, type ImageGen } from "./image-gen";
export { VideoGenSchema, type VideoGen } from "./video-gen";

import { z } from "zod";
import { ModelSchema } from "./model";
import { WebhookSchema } from "./webhook";
import { TeamsSchema } from "./teams";
import { ApiServerSchema } from "./api-server";
import { SlackSchema } from "./slack";
import { DiscordSchema } from "./discord";
import { WebSchema } from "./web";
import { BrowserSchema } from "./browser";
import { XSearchSchema } from "./x-search";
import { ImageGenSchema } from "./image-gen";
import { VideoGenSchema } from "./video-gen";

// Aggregator for the per-platform sub-schemas under config.platforms.*.
// Each platform owns its own schema file (slack.ts, webhook.ts, teams.ts,
// ...); this loose object composes them and lets untyped platforms pass
// through unchanged.
export const PlatformsSchema = z
  .looseObject({
    webhook: WebhookSchema,
    teams: TeamsSchema,
  })
  .optional()
  .describe("Messaging platform integrations.");

export type Platforms = z.infer<typeof PlatformsSchema>;

// Gateway-scoped server settings (config.gateway.*). Upstream documents the
// API server block here — `gateway.api_server:` — rather than under
// config.platforms.*.
export const GatewaySchema = z
  .looseObject({
    api_server: ApiServerSchema,
  })
  .optional()
  .describe("Gateway-scoped settings (API server, ...).");

export type Gateway = z.infer<typeof GatewaySchema>;

export const ConfigSchema = z
  .looseObject({
    model: ModelSchema,
    platforms: PlatformsSchema,
    gateway: GatewaySchema,
    slack: SlackSchema,
    discord: DiscordSchema,
    web: WebSchema,
    browser: BrowserSchema,
    x_search: XSearchSchema,
    image_gen: ImageGenSchema,
    video_gen: VideoGenSchema,
  })
  .optional()
  .describe(
    "Hermes agent configuration. Use the `readDocument` tool to look up the " +
      "semantics of any config field before writing it into the draft."
  );

export type Config = z.infer<typeof ConfigSchema>;