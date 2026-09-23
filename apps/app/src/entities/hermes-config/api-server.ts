import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
// Full field semantics: docs/official/api-server.md
//
// Mirrors the upstream `gateway.api_server:` block in config.yaml (flat
// fields, no `extra:` nesting). Environment variables take precedence over
// these config values when both are set.
//
// Only non-secret settings are typed here — key (the bearer token) is
// env-only by Hermeum policy (the reserved, sensitive API_SERVER_KEY env
// entry) and is never written into config.yaml; it passes through via
// looseObject.
export const ApiServerSchema = z
  .looseObject({
    enabled: z.boolean().optional().describe("Whether the API server is enabled."),
    port: z
      .number()
      .int()
      .optional()
      .describe("HTTP server port (default 8642)."),
    host: z
      .string()
      .optional()
      .describe("Bind address. Defaults to localhost only (127.0.0.1)."),
    cors_origins: z
      .string()
      .optional()
      .describe("Comma-separated allowed browser origins for CORS."),
    model_name: z
      .string()
      .optional()
      .describe("Model name advertised on /v1/models. Defaults to the profile name."),
    max_concurrent_runs: z
      .number()
      .int()
      .optional()
      .describe(
        "Concurrent-run cap across the endpoints that start a run directly: " +
          "OpenAI-compatible, Runs, and session-chat endpoints (default 10; " +
          "0 disables the limit). Cron-triggered runs go through the cron " +
          "scheduler's own limits, not this cap."
      ),
    history_tool_output_max_chars: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Cap each tool output and string tool-call argument in the stored " +
          "/v1/responses history at this many characters (default 0 = store " +
          "verbatim). The stored history is what chained turns replay, so " +
          "this also trims what the model sees; leave at 0 when complete " +
          "tool outputs are needed across turns."
      ),
  })
  .optional()
  .describe("OpenAI-compatible API server configuration.");

export type ApiServer = z.infer<typeof ApiServerSchema>;