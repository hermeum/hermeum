import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/browser
// Full field semantics: docs/hermes-config/browser.md
//
// Skipped on purpose: cloud_provider value "nous" (managed Tool Gateway) —
// it requires Nous Portal OAuth, which is not supported in container mode;
// it still passes through via looseObject.
export const BrowserCloudProviderSchema = z
  .enum(["browserbase", "browser-use", "firecrawl", "camofox", "local"])
  .describe(
    "Browser automation provider. local uses the local agent-browser CLI / " +
      "CDP path with cloud fallback disabled."
  );

export type BrowserCloudProvider = z.infer<typeof BrowserCloudProviderSchema>;

export const BrowserSchema = z
  .looseObject({
    cloud_provider: BrowserCloudProviderSchema.optional(),
  })
  .optional()
  .describe("Browser automation configuration.");

export type Browser = z.infer<typeof BrowserSchema>;