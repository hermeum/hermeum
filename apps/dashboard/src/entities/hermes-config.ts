// Config schema for LLM structured output: descriptions guide generation accuracy.
// Fields not defined here are still allowed (loose objects) so users can configure
// whatever the Hermes agent supports.

import { z } from "zod";

// Model
// https://hermes-agent.nousresearch.com/docs/integrations/providers
export const ModelProviderSchema = z
  .enum([
    "nous",
    "openai-codex",
    "copilot",
    "copilot-acp",
    "anthropic",
    "openrouter",
    "novita",
    "zai",
    "kimi-coding",
    "kimi-coding-cn",
    "arcee",
    "gmi",
    "minimax",
    "minimax-cn",
    "xai",
    "xai-oauth",
    "alibaba",
    "alibaba-coding-plan",
    "kilocode",
    "xiaomi",
    "tencent-tokenhub",
    "opencode-zen",
    "opencode-go",
    "deepseek",
    "huggingface",
    "gemini",
    "vertex",
    "openai-api",
    "azure-foundry",
    "bedrock",
    "nvidia",
    "ollama-cloud",
    "qwen-oauth",
    "minimax-oauth",
    "stepfun",
    "lmstudio",
    "custom",
  ])
  .describe("LLM provider that serves the model.");

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
    `LLM model configuration for the agent. \
Only set this when the request names a specific provider or model; otherwise omit it.

Setting this requires an env var for the provider's API key \
(e.g. ANTHROPIC_API_KEY for provider: anthropic, OPENAI_API_KEY for provider: openai-api).

Example:
  provider: openai-api
  default: gpt-5.5`
  );

export type Model = z.infer<typeof ModelSchema>;

// Webhook
// https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks
export const WebhookDeliverSchema = z
  .enum([
    "log",
    "github_comment",
    "telegram",
    "discord",
    "slack",
    "signal",
    "sms",
    "whatsapp",
    "matrix",
    "mattermost",
    "homeassistant",
    "email",
    "dingtalk",
    "feishu",
    "wecom",
    "weixin",
    "bluebubbles",
    "qqbot",
  ])
  .optional()
  .describe(
    `Where to send the response.

- log: writes the response to the gateway log only. Use only when the request \
has no delivery target (e.g. internal monitoring/testing).
- github_comment: posts the response as a PR/issue comment via the gh CLI — \
requires deliver_extra.repo and deliver_extra.pr_number.
- Any other value: routes the response to that chat platform's home channel, \
or a specific chat via deliver_extra.chat_id.`
  );

export type WebhookDeliver = z.infer<typeof WebhookDeliverSchema>;

export const DeliverExtraSchema = z
  .object({
    chat_id: z
      .string()
      .optional()
      .describe(
        "Destination chat/channel id for chat-based deliver targets. If omitted, the" +
          "response is sent to that platform's configured home channel."
      ),
    repo: z
      .string()
      .optional()
      .describe('Repository in "owner/repo" form. Required when deliver: github_comment.'),
    pr_number: z
      .string()
      .optional()
      .describe(
        "Pull request / issue number to comment on. Required when deliver: github_comment."
      ),
  })
  .optional()
  .describe(
    `Platform-specific delivery options; values support {dot.notation} templates.

- deliver: github_comment — requires repo and pr_number. Posts the response as a PR/issue \
comment via the gh CLI, which must be installed and authenticated on the gateway host.
- All other chat-based targets use the platform's configured home channel, or set chat_id to target a specific chat.

Example: { repo: "{repository.full_name}", pr_number: "{number}" }`
  );

export type DeliverExtra = z.infer<typeof DeliverExtraSchema>;

export const WebhookRouteSchema = z
  .object({
    events: z
      .array(z.string())
      .optional()
      .describe(
        `Event types this route accepts.

In most cases you don't need to set this — omit it (or leave it empty) to accept \
all events, which is fine for most routes. Only set it when the route should filter \
to specific event types.

- Source: read from X-GitHub-Event, X-GitLab-Event, or event_type in the payload.
- Example: ["pull_request"] to react only to PR events.`
      ),
    prompt: z
      .string()
      .optional()
      .describe(
        `Template string built from the webhook payload using dot-notation.

- {pull_request.title} resolves to payload["pull_request"]["title"]
- {repository.full_name} resolves to payload["repository"]["full_name"]

Don't guess at dot-notation paths for a payload shape you don't actually know — \
if you're unsure what the payload looks like, use {__raw__} instead, a special \
token that dumps the entire payload as indented JSON. \
Useful for monitoring alerts or generic webhooks where the agent needs the full context.

If omitted, the entire payload is dumped into the prompt (same as {__raw__} alone).`
      ),
    skills: z
      .array(z.string())
      .optional()
      .describe("Skill names to load for agent runs triggered by this route."),
    deliver: WebhookDeliverSchema,
    deliver_extra: DeliverExtraSchema,
    deliver_only: z
      .boolean()
      .optional()
      .describe(
        "If true, skip the agent and deliver the rendered prompt as a literal message. " +
          "Requires a real deliver target."
      ),
  })
  .describe(
    `A named webhook route that maps incoming events to an agent run or delivery. \
The route's key becomes part of the webhook URL path. 

Example — "review GitHub pull requests":
  github-pr-review:
    events: [pull_request]
    prompt: |
      Review this pull request:
      Repository: {repository.full_name}
      PR #{number}: {pull_request.title}
      Diff URL: {pull_request.diff_url}
    skills:
      - github-code-review
    deliver: github_comment
    deliver_extra:
      repo: "{repository.full_name}"
      pr_number: "{number}"`
  );

export type WebhookRoute = z.infer<typeof WebhookRouteSchema>;

export const WebhookSchema = z
  .object({
    enabled: z.boolean().optional().describe("Whether the webhook server is enabled."),
    extra: z
      .object({
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
          .describe(
            "Named webhook routes, keyed by route name (used in the webhook URL path). " +
              '"-" is preferred over "_" for the route name, e.g. "github-pr-review".'
          ),
      })
      .optional()
      .describe("Webhook server settings."),
  })
  .describe(
    `Webhook messaging platform configuration. \
Note that setting enabled: true requires a sensitive WEBHOOK_SECRET env var.`
  );

export type Webhook = z.infer<typeof WebhookSchema>;

export const PlatformsSchema = z
  .looseObject({
    webhook: WebhookSchema.optional(),
  })
  .describe("Messaging platform integrations.");

export type Platforms = z.infer<typeof PlatformsSchema>;

// Slack
// https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack
//
// Only the essential fields are validated here; the rest pass through
// via looseObject so users can configure whatever the Hermes agent supports.
export const SlackSchema = z
  .looseObject({
    allowed_channels: z
      .array(z.string())
      .optional()
      .describe(
        "Slack channel IDs the bot is allowed to respond in. " +
          "When set, messages from channels NOT in this list are silently ignored."
      ),
    unauthorized_dm_behavior: z
      .literal("ignore")
      .default("ignore")
      .optional()
      .describe(
        'What happens when an unauthorized user DMs the bot. Must be "ignore" — ' +
          "the message is silently dropped." 
      ),
  })
  .describe(
    `Slack messaging platform configuration. \

Example:
  slack:
    allowed_channels:
      - C0123456789
    unauthorized_dm_behavior: ignore`
  );

export type Slack = z.infer<typeof SlackSchema>;

// API server
// https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
//
// The Hermes agent has no api_server section in config.yaml (the API server is
// configured via env vars upstream), so this field is never written to the raw
// agent config. It maps to the HermesAgent CR's config.apiServer field, which the
// operator turns into API_SERVER_* environment variables.
export const ApiServerSchema = z
  .object({
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
    cors_origins: z
      .array(z.string())
      .optional()
      .describe(
        "Allowed browser origins. Corresponds to the comma-separated " +
          "API_SERVER_CORS_ORIGINS environment variable. Omit to disable CORS."
      ),
  })
  .describe(
    `API server configuration. \
Note that setting enabled: true requires a sensitive API_SERVER_KEY env var — \
it's the bearer token clients use to call the server.

Example — expose the agent over HTTP for a browser client:
  enabled: true
  cors_origins: [https://app.example.com]`
  );

export type ApiServer = z.infer<typeof ApiServerSchema>;

export const ConfigSchema = z
  .looseObject({
    model: ModelSchema.optional().describe("Model configuration to use."),
    platforms: PlatformsSchema.optional(),
    api_server: ApiServerSchema.optional(),
    slack: SlackSchema.optional(),
  })
  .optional()
  .describe(
    "Hermes agent configuration. Only well-known fields are validated here; " +
      "any additional fields are passed through unchanged."
  );

export type Config = z.infer<typeof ConfigSchema>;
