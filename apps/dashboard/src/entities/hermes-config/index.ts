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
  PlatformsSchema,
  type WebhookDeliver,
  type DeliverExtra,
  type WebhookRoute,
  type Webhook,
  type Platforms,
} from "./webhook";
export { SlackSchema, ChannelSkillBindingSchema, type Slack, type ChannelSkillBinding } from "./slack";
export {
  WebSearchBackendSchema,
  WebExtractBackendSchema,
  WebSchema,
  type WebSearchBackend,
  type WebExtractBackend,
  type Web,
} from "./web";
export { BrowserCloudProviderSchema, BrowserSchema, type BrowserCloudProvider, type Browser } from "./browser";

import { z } from "zod";
import { ModelSchema } from "./model";
import { PlatformsSchema } from "./webhook";
import { SlackSchema } from "./slack";
import { WebSchema } from "./web";
import { BrowserSchema } from "./browser";

export const ConfigSchema = z
  .looseObject({
    model: ModelSchema,
    platforms: PlatformsSchema,
    slack: SlackSchema,
    web: WebSchema,
    browser: BrowserSchema,
  })
  .optional()
  .describe(
    "Hermes agent configuration. Use the `readDocument` tool to look up the " +
      "semantics of any config field before writing it into the draft."
  );

export type Config = z.infer<typeof ConfigSchema>;