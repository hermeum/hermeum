import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/x-search
// Full field semantics: docs/hermes-config/x-search.md
// NOTE: only the XAI_API_KEY credential path is supported here
//
// Skipped on purpose: x_search.reasoning_effort (Grok-specific
// knob) is not typed here; it passes through via looseObject.
export const XSearchSchema = z
  .looseObject({
    model: z
      .string()
      .min(1)
      .optional()
      .describe("xAI model id for the Responses call (default grok-4.5)."),
    timeout_seconds: z
      .number()
      .int()
      .min(30)
      .optional()
      .describe("Request timeout in seconds (minimum 30, default 180)."),
    retries: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Auto-retries on 5xx / ReadTimeout / ConnectionError (default 2)."),
  })
  .optional()
  .describe("X (Twitter) Search configuration. Requires XAI_API_KEY.");

export type XSearch = z.infer<typeof XSearchSchema>;