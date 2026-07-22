// Hermes agent config schema.
//
// Only well-known fields the dashboard reads are typed here (see the per-field
// modules below); any additional fields pass through unchanged via looseObject.
// Full field semantics live in docs/hermes-config/ and are surfaced to the LLM
// via the readDocument tool, so .describe() texts are kept minimal — use the
// `readDocument` tool to look up the semantics of any config field you are not
// fully sure about before writing it into the draft.

export { WebConfigSchema, type WebConfig } from "./web";
export { BrowserConfigSchema, type BrowserConfig } from "./browser";
export {
  WebhookConfigSchema,
  type WebhookConfig,
  PlatformsConfigSchema,
  type PlatformsConfig,
} from "./webhook";

import { z } from "zod";
import { WebConfigSchema } from "./web";
import { BrowserConfigSchema } from "./browser";
import { PlatformsConfigSchema } from "./webhook";

export const ConfigSchema = z
  .looseObject({
    web: WebConfigSchema,
    browser: BrowserConfigSchema,
    platforms: PlatformsConfigSchema,
  })
  .optional()
  .describe(
    "Hermes agent configuration. Only well-known fields used by the Hermeum " +
      "are typed here; any additional fields pass through unchanged. Use the " +
      "`readDocument` tool to look up the semantics of any config field you " +
      "are not fully sure about before writing it into the draft."
  );

export type Config = z.infer<typeof ConfigSchema>;