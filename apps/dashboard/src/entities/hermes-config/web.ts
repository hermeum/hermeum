import { z } from "zod";

// Only the fields the dashboard reads (server/infras/kubernetes/client.ts) are
// typed here; everything else passes through as a loose field. Full field
// semantics live in docs/hermes-config/web-search.md and are surfaced to the
// LLM via the readDocument tool.
export const WebConfigSchema = z
  .looseObject({
    search_backend: z.string().optional(),
    backend: z.string().optional(),
  })
  .optional()
  .describe("Web search & extract config. See docs/hermes-config/web-search.md.");

export type WebConfig = z.infer<typeof WebConfigSchema>;