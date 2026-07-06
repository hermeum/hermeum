import { z } from "zod";

// Config schema for LLM structured output: descriptions guide generation accuracy.
// Fields not defined here are still allowed (loose objects) so users can configure
// whatever the Hermes agent supports.
export const ModelProviderSchema = z
  .union([
    z.enum(["anthropic", "openrouter", "zai", "kimi-coding", "openai-api", "ollama-cloud"]),
    z.string(),
  ])
  .describe(
    "LLM provider that serves the model. Prefer one of the known providers; " +
      "any other provider name is also accepted."
  );

export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const ModelSchema = z
  .looseObject({
    provider: ModelProviderSchema,
    default: z
      .string()
      .min(1)
      .describe(
        'Default model identifier used for requests, e.g. "moonshotai/kimi-k2.5" or "gpt-5".'
      ),
    base_url: z
      .url()
      .optional()
      .describe(
        "Base URL of the provider's API endpoint, " +
          'e.g. "https://api.novita.ai/openai/v1". Omit to use the provider default.'
      ),
  })
  .describe(
    "LLM model configuration for the agent. Credentials must be set as an " +
      "environment variable depending on provider, e.g. OPENAI_API_KEY is " +
      'required when provider is "openai-api".'
  );

export type Model = z.infer<typeof ModelSchema>;

export const WebhookDeliverSchema = z
  .union([z.enum(["log", "github_comment", "telegram", "discord", "slack", "email"]), z.string()])
  .describe(
    "Destination for the response. Common targets are enumerated; other platform names " +
      '(e.g. "signal", "matrix", "whatsapp") are also accepted. Defaults to "log".'
  );

export type WebhookDeliver = z.infer<typeof WebhookDeliverSchema>;

export const WebhookRouteSchema = z
  .looseObject({
    events: z
      .array(z.string())
      .optional()
      .describe(
        'Event types this route accepts, e.g. ["pull_request"]. Omit or leave empty to accept all events.'
      ),
    secret: z
      .string()
      .optional()
      .describe(
        "HMAC secret to validate webhook senders. Omit to fall back to the auto-generated " +
          "WEBHOOK_SECRET environment variable, which is already injected into the agent."
      ),
    prompt: z
      .string()
      .optional()
      .describe(
        "Prompt template for the agent. Supports {dot.notation} access to payload fields " +
          'and {__raw__} for the whole payload as JSON, e.g. "PR #{number}: {pull_request.title}".'
      ),
    skills: z
      .array(z.string())
      .optional()
      .describe("Skill names to load for agent runs triggered by this route."),
    deliver: WebhookDeliverSchema.optional(),
    deliver_extra: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Platform-specific delivery options; values support {dot.notation} templates, " +
          'e.g. { repo: "{repository.full_name}", pr_number: "{number}" }.'
      ),
    deliver_only: z
      .boolean()
      .optional()
      .describe(
        "If true, skip the agent and deliver the rendered prompt as a literal message. " +
          "Requires a real deliver target."
      ),
  })
  .describe("A named webhook route that maps incoming events to an agent run or delivery.");

export type WebhookRoute = z.infer<typeof WebhookRouteSchema>;

export const WebhookSchema = z
  .looseObject({
    enabled: z.boolean().optional().describe("Whether the webhook server is enabled."),
    extra: z
      .looseObject({
        port: z
          .number()
          .int()
          .optional()
          .describe(
            "Port the webhook server listens on. Defaults to 8644; omit this unless a different port is needed."
          ),
        rate_limit: z.number().optional().describe("Maximum requests per minute. Defaults to 30."),
        max_body_bytes: z
          .number()
          .optional()
          .describe("Maximum request body size in bytes. Defaults to 1048576 (1 MB)."),
        routes: z
          .record(z.string(), WebhookRouteSchema)
          .optional()
          .describe("Named webhook routes, keyed by route name (used in the webhook URL path)."),
      })
      .optional()
      .describe("Webhook server settings."),
  })
  .describe(
    "Webhook messaging platform configuration. Requires the WEBHOOK_SECRET environment " +
      "variable to be set when enabled=true."
  );

export type Webhook = z.infer<typeof WebhookSchema>;

export const PlatformsSchema = z
  .looseObject({
    webhook: WebhookSchema.optional(),
  })
  .describe("Messaging platform integrations.");

export type Platforms = z.infer<typeof PlatformsSchema>;

// config.yaml support for the API server isn't officially released upstream yet (only
// env vars are documented), but it's added here so Hermeum can generate declarative
// agent config ahead of that release.
export const ApiServerSchema = z
  .looseObject({
    enabled: z
      .boolean()
      .optional()
      .describe(
        "Whether the API server is enabled. Corresponds to the API_SERVER_ENABLED " +
          "environment variable. Defaults to false."
      ),
    port: z
      .number()
      .int()
      .optional()
      .describe(
        "HTTP server port. Corresponds to the API_SERVER_PORT environment variable. " +
          "Defaults to 8642."
      ),
    host: z
      .string()
      .optional()
      .describe(
        "Bind address. Corresponds to the API_SERVER_HOST environment variable. " +
          "Defaults to 127.0.0.1 (localhost only)."
      ),
    cors_origins: z
      .array(z.string())
      .optional()
      .describe(
        "Allowed browser origins. Corresponds to the comma-separated " +
          "API_SERVER_CORS_ORIGINS environment variable. Omit to disable CORS."
      ),
  })
  .describe(
    "API server configuration. The bearer auth token (API_SERVER_KEY) is a credential " +
      "and must be set via the agent's env vars (marked sensitive), not here."
  );

export type ApiServer = z.infer<typeof ApiServerSchema>;

export const ConfigSchema = z
  .looseObject({
    model: ModelSchema.optional().describe("Model configuration to use."),
    platforms: PlatformsSchema.optional(),
    api_server: ApiServerSchema.optional(),
  })
  .optional()
  .describe(
    "Hermes agent configuration. Only well-known fields are validated here; " +
      "any additional fields are passed through unchanged."
  );

export type Config = z.infer<typeof ConfigSchema>;
