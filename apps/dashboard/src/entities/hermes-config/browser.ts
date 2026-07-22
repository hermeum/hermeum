import { z } from "zod";

// Only the fields the dashboard reads (server/infras/kubernetes/client.ts) are
// typed here; everything else passes through as a loose field. Full field
// semantics live in docs/hermes-config/browser.md and are surfaced to the LLM
// via the readDocument tool.
export const BrowserConfigSchema = z
  .looseObject({
    cloud_provider: z.string().optional(),
  })
  .optional()
  .describe("Browser automation config. See docs/hermes-config/browser.md.");

export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;