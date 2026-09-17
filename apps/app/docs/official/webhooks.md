---
name: webhooks
category: platforms
description: Webhook platform configuration (`platforms.webhook`) — secret references, routes, delivery targets, prompt templates, per-route toolsets, and env vars.
---

# Webhook configuration (`platforms.webhook`)

Configures the webhook adapter, which runs an HTTP server that accepts POST
requests, validates HMAC signatures, transforms payloads into agent prompts,
and routes responses back to a configured target platform.

## Fields

- `enabled` — enable the webhook platform adapter (bool).
- `secret` — global HMAC secret used for signature validation on all routes
  (required). Set it as an env var reference, e.g. `secret: ${WEBHOOK_SECRET}`;
  the actual value lives in the sensitive `WEBHOOK_SECRET` env entry and
  hermes substitutes it at config load. See
  [Secret references](#secret-references).
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
| `secret` | No | HMAC secret for this route, as an env var reference (e.g. `secret: ${GITHUB_WEBHOOK_SECRET}`). Falls back to the global `platforms.webhook.secret` when omitted. |
| `prompt` | No | Template string with dot-notation payload access (e.g. `{pull_request.title}`). If omitted, the full JSON payload is dumped into the prompt. See [Prompt templates](#prompt-templates). |
| `skills` | No | List of skill names to load for the agent run. |
| `toolsets` | No | List of toolset keys (e.g. `["terminal", "file", "web"]`) that **replaces** the platform-level webhook toolset for runs triggered by this route only. Manual config edit only — not settable via `hermes webhook subscribe`, so agent-created subscriptions cannot self-grant elevated tools. See [Per-route toolsets](#per-route-toolsets). |
| `deliver` | No | Where to send the response (default `log`). See [Delivery targets](#delivery-targets). |
| `deliver_extra` | No | Additional delivery config — keys depend on `deliver` type (e.g. `repo`, `pr_number`, `chat_id`). Values support the same `{dot.notation}` templates as `prompt`. |
| `deliver_only` | No | If `true`, skip the agent entirely — the rendered `prompt` template becomes the literal message that gets delivered. Zero LLM cost, sub-second delivery. Requires `deliver` to be a real target (not `log`). |

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
    enabled: true
    secret: ${WEBHOOK_SECRET}
    extra:
      routes:
        oom-emergency:
          secret: ${MONITOR_WEBHOOK_SECRET}
          prompt: "Memory emergency: {detail}. Diagnose with ps/free/py-spy and report."
          toolsets: ["terminal", "file", "code_execution", "web"]
          deliver: "telegram"
env:
  - name: MONITOR_WEBHOOK_SECRET
    value: monitor-secret-here
    sensitive: true
```

## Secret references

The HMAC secret is required in `config.yaml` as an env var reference, not as
a literal value. Hermes supports env var substitution in `config.yaml`:
`${VAR_NAME}` is replaced with the value of the env var at config load; an
unresolved reference is kept verbatim and logged as a warning.

```yaml
platforms:
  webhook:
    secret: ${WEBHOOK_SECRET}
```

The referenced env entry (`WEBHOOK_SECRET` here) carries the actual secret
value and must be marked `sensitive: true` — never write the literal secret
into `config.yaml`. 

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WEBHOOK_ENABLED` | Enable the webhook platform adapter. | `false` |
| `WEBHOOK_PORT` | HTTP server port for receiving webhooks. | `8644` |
| `WEBHOOK_SECRET` | Global HMAC secret used for signature validation on all routes. | _(none)_ |

The app reads `WEBHOOK_ENABLED` / `WEBHOOK_PORT` to drive the agent's
Kubernetes container and Service port mappings, mirroring the
`API_SERVER_*` env vars (see [api-server.md](./api-server.md)). The secret
flows to the agent through its env Secret/ConfigMap alongside other
sensitive env vars — no separate `secretRef` is wired into the CR.

### Configuration preferred over env vars

Webhook can be configured through either `config.platforms.webhook`
(`enabled`, `extra.port`) **or** env vars (`WEBHOOK_ENABLED`,
`WEBHOOK_PORT`). The `config.yaml` fields are preferred and take
precedence over the env vars when both are set; the env vars act as a
fallback for deployments that don't set `config.yaml`. Hermeum prefers
authoring through `config.yaml` — the secret is always set there as an
env var reference (see [Secret references](#secret-references)).

## Example

### GitHub PR review webhook posting back as a comment

```yaml
config:
  platforms:
    webhook:
      enabled: true
      secret: ${WEBHOOK_SECRET}
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
  - name: WEBHOOK_SECRET
    value: wh-secret-here
    sensitive: true
  - name: GH_TOKEN
    value: ghp_xxxxxxxxxxxx
    sensitive: true
```

The HMAC secret is set in config as a `${WEBHOOK_SECRET}` reference and the
actual value is provided via the `WEBHOOK_SECRET` env entry (sensitive). The
`GH_TOKEN` env entry is required for `github_comment` delivery so the `gh`
CLI can authenticate when running inside the agent container.

The `toolsets: [web, vision, clarify]` line is optional here — it matches the
webhook default exactly, so this route gets the safe subset either way. It is
included to show the pattern: routes only handling untrusted third-party
payloads (public PRs) stay at the default, while routes with a task that
needs more capability use a wider list (see
[Per-route toolsets](#per-route-toolsets)).
