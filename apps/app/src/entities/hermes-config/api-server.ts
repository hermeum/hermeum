import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
// Full field semantics: docs/hermes-config/api-server.md
//
// Mirrors the upstream `gateway.api_server:` block in config.yaml (flat
// fields, no `extra:` nesting). Environment variables take precedence over
// these config values when both are set.
//
// Only non-secret settings are typed here — `key` (the bearer token) is
// env-only (API_SERVER_KEY, sensitive) and must not be written into
// config.yaml. Upstream accepts it in config.yaml, but Hermeum does not
// surface it (a hand-written key still passes through via looseObject).
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
        "Concurrent-run cap across the OpenAI-compatible and Runs endpoints " +
          "(default 10; 0 disables the limit)."
      ),
  })
  .optional()
  .describe("OpenAI-compatible API server configuration.");

export type ApiServer = z.infer<typeof ApiServerSchema>;