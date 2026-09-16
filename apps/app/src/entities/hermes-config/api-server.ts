import { z } from "zod";

import { SecretRefSchema } from "./shared";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
// Full field semantics: docs/official/api-server.md
//
// Mirrors the upstream `gateway.api_server:` block in config.yaml (flat
// fields, no `extra:` nesting). Environment variables take precedence over
// these config values when both are set.
//
// key (the bearer token) is typed as a ${VAR} reference — the actual value
// lives in the sensitive API_SERVER_KEY env entry and hermes substitutes it
// at config load. Literal secrets are rejected.
export const ApiServerSchema = z
  .looseObject({
    enabled: z.boolean().optional().describe("Whether the API server is enabled."),
    key: SecretRefSchema.optional().describe("Bearer token for auth, as an env var reference."),
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