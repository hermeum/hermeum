import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks
// Full field semantics: docs/official/webhooks.md
//
// Adapter settings (port, ...) are valid directly under platforms.webhook:
// as well as under extra: (upstream: both spellings reach the adapter; a
// value nested under extra: wins if the same key appears in both).
//
// Skipped on purpose: the route field script and the secret fields
// (platforms.webhook.secret, routes.<name>.secret) are not typed here.
// script is an operator-level concern; secrets are env-only by Hermeum
// policy (the reserved, sensitive WEBHOOK_SECRET env entry) and are never
// written into config.yaml. Both pass through via looseObject.
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
  .describe("Where to send the response.");

export type WebhookDeliver = z.infer<typeof WebhookDeliverSchema>;

export const DeliverExtraSchema = z
  .looseObject({
    chat_id: z.string().optional().describe("Destination chat/channel id."),
    repo: z.string().optional().describe('Repository in "owner/repo" form.'),
    pr_number: z.string().optional().describe("PR/issue number to comment on."),
  })
  .optional()
  .describe("Platform-specific delivery options.");

export type DeliverExtra = z.infer<typeof DeliverExtraSchema>;

// Toolset keys accepted in a route's `toolsets` list — plain strings, not
// an enum: the valid universe (toolsets.py TOOLSETS + composites like
// `coding`/`debugging`/`safe` + check_fn-gated entries like `kanban` +
// platform bundles like `hermes-cli` (hyphens) + plugin-provided toolsets)
// drifts every upstream release and cannot be statically enumerated.
// Upstream does not validate either — the adapter
// (gateway/platforms/webhook.py toolsets_for_source) passes the list
// through and unknown names are silently dropped at resolution time.
export const WebhookRouteToolsetSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_-]*$/,
    "lowercase toolset key — snake_case for core toolsets (`terminal`), hyphenated for platform toolsets (`hermes-cli`)."
  )
  .describe("A toolset key enabled for runs triggered by this route, e.g. `web`, `terminal`, `file`, `code_execution`.");

export type WebhookRouteToolset = z.infer<typeof WebhookRouteToolsetSchema>;

// Recursive: `all`/`any`/`not` groups nest filter objects. Zod cannot
// infer the type of a recursive schema, so the output type is declared
// up front (zod lazy-type pattern) and the schema annotates it.
// Operator semantics (upstream webhook_filters.py): one operator per
// filter object, `field` selects the dot-notation path under test, and a
// spec with no recognized operator never matches. `equals`/`not_equals`/
// `contains` compare against arbitrary JSON values, so they stay untyped.
export interface WebhookFilter {
  field?: string | undefined;
  exists?: boolean | undefined;
  missing?: true | undefined;
  equals?: unknown;
  not_equals?: unknown;
  contains?: unknown;
  in?: unknown[] | undefined;
  in_file?: string | undefined;
  regex?: string | undefined;
  all?: WebhookFilter[] | undefined;
  any?: WebhookFilter[] | undefined;
  not?: WebhookFilter | undefined;
}

export const WebhookFilterSchema: z.ZodType<WebhookFilter> = z.lazy(() =>
  z
    .looseObject({
      field: z
        .string()
        .optional()
        .describe(
          "Dot-notation field path to test, e.g. `payload.labels`, " +
            "`event`, or `headers.<Name>`."
        ),
      exists: z
        .boolean()
        .optional()
        .describe("Match when the field exists (false: when it does not)."),
      missing: z
        .literal(true)
        .optional()
        .describe("Match when the field is absent."),
      equals: z
        .unknown()
        .optional()
        .describe("Match when the field equals this value."),
      not_equals: z
        .unknown()
        .optional()
        .describe("Match when the field differs from this value."),
      contains: z
        .unknown()
        .optional()
        .describe(
          "Match when the field contains this value — substring for " +
            "strings, member for lists, key for dicts."
        ),
      in: z
        .array(z.unknown())
        .optional()
        .describe("Match when the field is one of these inline values."),
      in_file: z
        .string()
        .optional()
        .describe(
          "Match when the field appears in this file — a JSON array, a " +
            "JSON object (keys are used), or newline-delimited text."
        ),
      regex: z
        .string()
        .optional()
        .describe("Match when the field matches this Python regex."),
      all: z
        .array(WebhookFilterSchema)
        .optional()
        .describe("Group: every sub-filter must match."),
      any: z
        .array(WebhookFilterSchema)
        .optional()
        .describe("Group: at least one sub-filter must match."),
      not: WebhookFilterSchema.optional().describe("Group: negated sub-filter."),
    })
    .describe("A declarative payload filter evaluated on the webhook body."),
);

export const WebhookRouteSchema = z
  .looseObject({
    events: z.array(z.string()).optional().describe("Event types this route accepts."),
    prompt: z
      .string()
      .optional()
      .describe("Prompt template with {dot.notation} payload access."),
    filters: z
      .union([z.array(WebhookFilterSchema), WebhookFilterSchema])
      .optional()
      .describe(
        "Declarative payload filters. A list must match every entry; a " +
          "single filter object is also accepted. Evaluated after auth, " +
          "body parsing, and events, before prompt rendering or agent " +
          "dispatch; non-matches are ignored with HTTP 200."
      ),
    skills: z.array(z.string()).optional().describe("Skill names to load for this route."),
    toolsets: z
      .array(WebhookRouteToolsetSchema)
      .optional()
      .describe(
        "Toolsets enabled for runs triggered by this route. REPLACES the " +
          "platform-level webhook toolset for this route only; when omitted, " +
          "runs use the constrained webhook default. Grant elevated toolsets " +
          "only to fully-trusted senders, for what the route's task needs."
      ),
    deliver: WebhookDeliverSchema,
    deliver_extra: DeliverExtraSchema,
    deliver_only: z
      .boolean()
      .optional()
      .describe("Skip the agent and deliver the rendered prompt as a literal message."),
    cron_job: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Fire an existing cron job (by ID or name) on each event instead of " +
          "starting a fresh webhook agent session. The rendered prompt becomes " +
          "transient per-run context; the job's own settings apply. Mutually " +
          "exclusive with deliver_only (and coalesce); deliver/deliver_extra/" +
          "skills are ignored on cron_job routes."
      ),
    coalesce: z
      .looseObject({
        key: z
          .string()
          .min(1)
          .describe(
            "Payload field or template identifying the logical entity, " +
              "e.g. `pull_request.number` or `{repository.full_name}#{pull_request.number}`."
          ),
        window_seconds: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Quiet window in seconds (default 30)."),
        max_wait_seconds: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Total buffering cap from the group's first event (default 300)."),
      })
      .optional()
      .describe(
        "Debounce rapid distinct events on the same logical entity into one " +
          "agent run. Mutually exclusive with deliver_only and cron_job; " +
          "coalesced requests return HTTP 202."
      ),
  })
  .describe("A named webhook route.");

export type WebhookRoute = z.infer<typeof WebhookRouteSchema>;

export const WebhookSchema = z
  .looseObject({
    enabled: z.boolean().optional().describe("Whether the webhook server is enabled."),
    extra: z
      .looseObject({
        port: z.number().int().optional().describe("Webhook server port."),
        rate_limit: z.number().optional().describe("Max requests per minute."),
        max_body_bytes: z.number().optional().describe("Max request body size in bytes."),
        routes: z
          .record(z.string(), WebhookRouteSchema)
          .optional()
          .describe("Named webhook routes keyed by route name."),
      })
      .optional()
      .describe("Webhook server settings."),
  })
  .optional()
  .describe("Webhook platform configuration.");

export type Webhook = z.infer<typeof WebhookSchema>;