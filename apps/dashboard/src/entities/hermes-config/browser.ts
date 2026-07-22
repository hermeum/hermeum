import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/browser
// Full field semantics: docs/hermes-config/browser.md
export const BrowserCloudProviderSchema = z
  .enum(["browserbase", "browser-use", "firecrawl", "camofox"])
  .describe("Browser automation provider.");

export type BrowserCloudProvider = z.infer<typeof BrowserCloudProviderSchema>;

export const BrowserSchema = z
  .looseObject({
    cloud_provider: BrowserCloudProviderSchema.optional(),
  })
  .optional()
  .describe("Browser automation configuration.");

export type Browser = z.infer<typeof BrowserSchema>;