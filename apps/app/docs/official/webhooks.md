---
name: webhooks
category: platforms
description: Webhook platform configuration (`platforms.webhook`) — routes, payload filters, delivery targets, prompt templates, per-route toolsets, and env vars.
---

# Webhook configuration (`platforms.webhook`)

Configures the webhook platform — an HTTP endpoint that accepts POST
requests (HMAC-validated), turns payloads into agent prompts via named
routes, and delivers responses to a target platform.

## Fields

- `enabled` — whether the webhook platform adapter is enabled. The
  adapter (and the `WEBHOOK_SECRET` env var) only takes effect when
  `WEBHOOK_ENABLED=true` is also set — see
  [Environment variables](#environment-variables).
- `secret` — global HMAC secret used for signature validation on all
  routes. Env-only: set the `WEBHOOK_SECRET` env entry (sensitive) instead
  of writing it into `config.yaml`. See
  [Secrets](#secrets).
- `extra.port` — HTTP server port for receiving webhooks (default `8644`).
- `extra.rate_limit` — per-route rate limit in requests per minute
  (default `30`).
- `extra.max_body_bytes` — maximum request body size in bytes before the
  body is read (default `1048576`, i.e. 1 MB).
- `extra.routes` — map of named routes. Each key is the route name and
  becomes the URL path (`/webhooks/<route-name>`). Each value is a route
  object (see [Route fields](#route-fields)).

## Route fields

| Field | Required | Description |
|-------|----------|-------------|
| `events` | No | List of event types to accept (e.g. `["pull_request"]`). If empty, all events are accepted. Event type is read from `X-GitHub-Event`, `X-GitLab-Event`, or `event_type` in the payload. |
| `secret` | No | HMAC secret for this route, falling back to the global `WEBHOOK_SECRET` env var when omitted. Env-only — do not write secrets into `config.yaml`. |
| `prompt` | No | Template string with dot-notation payload access (e.g. `{pull_request.title}`). If omitted, the full JSON payload is dumped into the prompt. See [Prompt templates](#prompt-templates). |
| `filters` | No | Declarative payload filters for this route (a list, or a single filter object). See [Payload filters](#payload-filters). |
| `skills` | No | List of skill names to load for the agent run. |
| `toolsets` | No | List of toolset keys (e.g. `["terminal", "file", "web"]`) that **replaces** the platform-level webhook toolset for runs triggered by this route only. Manual config edit only — not settable via `hermes webhook subscribe`, so agent-created subscriptions cannot self-grant elevated tools. See [Per-route toolsets](#per-route-toolsets). |
| `deliver` | No | Where to send the response (default `log`). See [Delivery targets](#delivery-targets). |
| `deliver_extra` | No | Additional delivery config — keys depend on `deliver` type (e.g. `repo`, `pr_number`, `chat_id`). Values support the same `{dot.notation}` templates as `prompt`. |
| `deliver_only` | No | If `true`, skip the agent entirely — the rendered `prompt` template becomes the literal message that gets delivered. Zero LLM cost, sub-second delivery. Requires `deliver` to be a real target (not `log`). |
| `cron_job` | No | Fire an existing cron job (by ID or name) on each event instead of starting a fresh webhook agent session. The rendered `prompt` becomes transient per-run context; the job's own prompt, skills, model, and delivery settings apply. Mutually exclusive with `deliver_only`. See [Event-Triggered Cron Jobs](#event-triggered-cron-jobs). |
| `coalesce` | No | Debounce rapid distinct events on the same logical entity into one agent run. Block with a required `key` (payload field or template identifying the entity, e.g. `pull_request.number`), optional `window_seconds` (quiet window, default 30) and `max_wait_seconds` (dispatch cap, default 300). See [Event Coalescing](#event-coalescing). Mutually exclusive with `deliver_only` and `cron_job`. |

## Payload filters

Use `filters` when a provider sends a broad event stream but only some
payloads should wake the agent or trigger `deliver_only` delivery. Filters
run after signature validation, body parsing, and `events`, but before
prompt rendering, idempotency, agent dispatch, or direct delivery.
Non-matches return `{"status":"ignored","reason":"filter"}` with HTTP 200.

A route's `filters` is a list of filter objects (all must match) or a
single filter object. Supported operators:

- `exists: true|false`
- `missing: true`
- `equals` / `not_equals`
- `contains` for strings, lists, and dict keys
- `in` for inline lists
- `in_file` for JSON arrays, JSON objects (keys are used), or
  newline-delimited text files
- `regex`
- `all`, `any`, and `not` groups

Field paths use dot notation. `payload.foo` reads from a top-level
`payload` object when one exists, or from the root webhook body for flat
payloads. `event` / `event_type` match the resolved event type, and
`headers.<Name>` reads request headers.

### Event Coalescing {#event-coalescing}

`coalesce` debounces rapid distinct events on the same logical entity
(five rapid pushes to one PR, a flapping alert) into **one** agent run
per entity, instead of one run per event:

```yaml
platforms:
  webhook:
    extra:
      routes:
        github-pr:
          events: ["pull_request"]
          coalesce:
            key: "{repository.full_name}#{pull_request.number}"
            window_seconds: 30      # quiet window (default 30)
            max_wait_seconds: 300   # dispatch cap (default 300)
          prompt: "Review PR #{pull_request.number}: {pull_request.title}"
          deliver: "github_comment"
          deliver_extra:
            repo: "{repository.full_name}"
            pr_number: "{pull_request.number}"
```

A bare dotted field or a full template both work as `key`; each new
event replaces the pending one, and the group dispatches one run using
the latest event's templates when `window_seconds` pass. Events whose
`key` does not resolve dispatch immediately instead. Coalesced requests
return HTTP 202; pending groups are flushed on adapter disconnect, not
dropped. `coalesce` is agent-mode only — combining it with
`deliver_only` or `cron_job` is rejected at startup.

### Event-Triggered Cron Jobs {#event-triggered-cron-jobs}

`cron_job` fires an **existing cron job** (by ID or name) whenever an
event arrives, instead of starting a fresh webhook agent session:

```yaml
platforms:
  webhook:
    extra:
      routes:
        pr-feedback:
          events: ["pull_request_review"]
          cron_job: "pr-review-sweeper"
          prompt: |
            PR #{number} in {repository.full_name} received new review feedback
            from {review.user.login}: {review.body}
```

The route's `prompt` template is rendered from the payload and injected
into the job as transient per-run context; the job's own prompt, skills,
model, and delivery settings apply. `cron_job` is mutually exclusive
with `deliver_only` (and `coalesce`); the route-level `deliver`,
`deliver_extra`, and `skills` fields are ignored on `cron_job` routes.
Paused/disabled jobs are not fired; the POST returns `202 Accepted`
immediately.

```yaml
platforms:
  webhook:
    extra:
      routes:
        todoist:
          events: ["item:updated"]
          filters:
            - field: "payload.labels"
              contains: "hermes"
            - any:
                - field: "payload.priority"
                  equals: 4
                - field: "payload.project_id"
                  in_file: "~/.hermes/data/todoist/watchlist.json"
          prompt: "Todoist task changed: {payload.content}"
```

## Delivery targets

The `deliver` field controls where the agent's response goes after processing
the webhook event.

| Value | Description |
|-------|-------------|
| `log` | Logs the response to the gateway log output. Default; useful for testing. |
| `github_comment` | Posts the response as a PR/issue comment via the `gh` CLI. Requires `deliver_extra.repo` and `deliver_extra.pr_number`. The `gh` CLI must be installed and authenticated on the gateway host. In agent containers, provide a `GH_TOKEN` (or `GITHUB_TOKEN`) env var so the CLI can authenticate without an interactive `gh auth login` session. |
| `telegram` | Routes the response to Telegram. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `discord` | Routes the response to Discord. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `slack` | Routes the response to Slack. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `signal` | Routes the response to Signal. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `sms` | Routes the response to SMS via Twilio. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `whatsapp` | Routes the response to WhatsApp. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `matrix` | Routes the response to Matrix. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `mattermost` | Routes the response to Mattermost. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `homeassistant` | Routes the response to Home Assistant. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `email` | Routes the response to Email. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `dingtalk` | Routes the response to DingTalk. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `feishu` | Routes the response to Feishu/Lark. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `wecom` | Routes the response to WeCom. Uses the home channel, or `chat_id` in `deliver_extra`. |
| `weixin` | Routes the response to Weixin (WeChat). Uses the home channel, or `chat_id` in `deliver_extra`. |
| `bluebubbles` | Routes the response to BlueBubbles (iMessage). Uses the home channel, or `chat_id` in `deliver_extra`. |
| `qqbot` | Routes the response to QQ Bot. Uses the home channel, or `chat_id` in `deliver_extra`. |

For cross-platform delivery, the target platform must also be enabled and
connected in the gateway. If no `chat_id` is provided in `deliver_extra`,
the response is sent to that platform's configured home channel.

## Prompt templates

Prompts use dot-notation to access nested fields in the webhook payload:

- `{pull_request.title}` resolves to `payload["pull_request"]["title"]`
- `{repository.full_name}` resolves to `payload["repository"]["full_name"]`
- `{__raw__}` — special token that dumps the **entire payload** as indented
  JSON (truncated at 4000 characters). Useful for monitoring alerts or
  generic webhooks where the agent needs the full context.
- Missing keys are left as the literal `{key}` string (no error).
- Nested dicts and lists are JSON-serialized and truncated at 2000
  characters.

You can mix `{__raw__}` with regular template variables:

```yaml
prompt: "PR #{pull_request.number} by {pull_request.user.login}: {__raw__}"
```

If no `prompt` template is configured for a route, the entire payload is
dumped as indented JSON (truncated at 4000 characters).

The same dot-notation templates work in `deliver_extra` values.

## Per-route toolsets

Webhook agent runs default to a deliberately constrained toolset
(`web_search`, `web_extract`, `vision_analyze`, `clarify`) because webhook
payloads can carry untrusted third-party content — a public PR title or
issue comment should never be able to prompt-inject its way into your
terminal.

For **trusted** routes — a localhost monitoring daemon pushing system
alerts, an internal CI system — grant the wider toolset that the route's
task requires, on that route only, without widening every other webhook
route:

```yaml
platforms:
  webhook:
    extra:
      routes:
        oom-emergency:
          prompt: "Memory emergency: {detail}. Diagnose with ps/free/py-spy and report."
          toolsets: ["terminal", "file", "code_execution", "web"]
          deliver: "telegram"
env:
  - name: WEBHOOK_ENABLED
    value: "true"
  - name: WEBHOOK_SECRET
    value: monitor-secret-here
    sensitive: true
```

## Secrets

The HMAC secret is **env-only**: set it as the `WEBHOOK_SECRET` env entry
(marked `sensitive: true`) — never write the literal secret into
`config.yaml`. A per-route secret can be set as its own env var and
referenced by the route only via the operator-level config surface, which
Hermeum does not author.

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WEBHOOK_ENABLED` | Enable the webhook platform adapter. Required for `WEBHOOK_SECRET`/`WEBHOOK_PORT` to take effect. | `false` |
| `WEBHOOK_PORT` | HTTP server port for receiving webhooks. | `8644` |
| `WEBHOOK_SECRET` | Global HMAC secret used for signature validation on all routes. Mark the env entry `sensitive: true`. | _(none)_ |

Adapter settings (`port`, `host`, `secret`, `routes`) may also be written
directly under `platforms.webhook:` — both spellings reach the adapter; a
value nested under `extra:` wins if the same key appears in both places.
Signature schemes: GitHub, GitLab, Standard Webhooks, and the generic
V2 / legacy V1 forms described upstream.

The app reads `WEBHOOK_ENABLED` / `WEBHOOK_PORT` to drive the agent's
Kubernetes container and Service port mappings, mirroring the
`API_SERVER_*` env vars (see [api-server.md](./api-server.md)). The secret
flows to the agent through its env Secret/ConfigMap alongside other
sensitive env vars — no separate `secretRef` is wired into the CR.

### Env-var enablement only

Webhook behavioral settings that live in `config.yaml` (`extra.port`,
`extra.routes`) are preferred there, but **enabling the platform is
env-only** (`WEBHOOK_ENABLED=true`) — config enablement is not surfaced.
`extra.port` still takes precedence over `WEBHOOK_PORT` when both are set.

## Example

### GitHub PR review webhook posting back as a comment

```yaml
config:
  platforms:
    webhook:
      extra:
        port: 8644
        routes:
          github-pr:
            events: [pull_request]
            prompt: |
              Review this pull request:
              Repository: {repository.full_name}
              PR #{number}: {pull_request.title}
              Author: {pull_request.user.login}
              URL: {pull_request.html_url}
              Diff URL: {pull_request.diff_url}
              Action: {action}
              skills: [github-code-review]
              toolsets: [web, vision, clarify]
              deliver: github_comment
            deliver_extra:
              repo: "{repository.full_name}"
              pr_number: "{number}"
env:
  - name: WEBHOOK_ENABLED
    value: "true"
  - name: WEBHOOK_SECRET
    value: wh-secret-here
    sensitive: true
  - name: GH_TOKEN
    value: ghp_xxxxxxxxxxxx
    sensitive: true
```

The webhook is enabled via the `WEBHOOK_ENABLED` env entry, and the HMAC
secret flows through the sensitive `WEBHOOK_SECRET` env entry — secrets
never go into `config.yaml` (see [Secrets](#secrets)). The `GH_TOKEN` env
entry is required for `github_comment` delivery so the `gh` CLI can
authenticate when running inside the agent container.

The `toolsets: [web, vision, clarify]` line is optional here — it matches the
webhook default exactly, so this route gets the safe subset either way. It is
included to show the pattern: routes only handling untrusted third-party
payloads (public PRs) stay at the default, while routes with a task that
needs more capability use a wider list (see
[Per-route toolsets](#per-route-toolsets)).
