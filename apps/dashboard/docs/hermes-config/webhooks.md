---
name: webhooks
category: platforms
description: Webhook platform configuration (`platforms.webhook`) — routes, delivery targets, prompt templates, and env vars.
---

# Webhook configuration (`platforms.webhook`)

Configures the webhook adapter, which runs an HTTP server that accepts POST
requests, validates HMAC signatures, transforms payloads into agent prompts,
and routes responses back to a configured target platform.

## Fields

- `enabled` — enable the webhook platform adapter (bool).
- `extra.port` — HTTP server port for receiving webhooks (default `8644`).
- `extra.rate_limit` — per-route rate limit in requests per minute
  (default `30`).
- `extra.max_body_bytes` — maximum request body size in bytes before the
  body is read (default `1048576`, i.e. 1 MB).
- `extra.routes` — map of named routes. Each key is the route name and
  becomes the URL path (`/webhooks/<route-name>`). Each value is a route
  object (see [Route fields](#route-fields)).

The HMAC secret is **not** set in `config.yaml` — it lives in the
`WEBHOOK_SECRET` environment variable (see [Environment variables](#environment-variables))
to avoid exposing credentials in plain text.

## Route fields

| Field | Required | Description |
|-------|----------|-------------|
| `events` | No | List of event types to accept (e.g. `["pull_request"]`). If empty, all events are accepted. Event type is read from `X-GitHub-Event`, `X-GitLab-Event`, or `event_type` in the payload. |
| `prompt` | No | Template string with dot-notation payload access (e.g. `{pull_request.title}`). If omitted, the full JSON payload is dumped into the prompt. See [Prompt templates](#prompt-templates). |
| `skills` | No | List of skill names to load for the agent run. |
| `deliver` | No | Where to send the response (default `log`). See [Delivery targets](#delivery-targets). |
| `deliver_extra` | No | Additional delivery config — keys depend on `deliver` type (e.g. `repo`, `pr_number`, `chat_id`). Values support the same `{dot.notation}` templates as `prompt`. |
| `deliver_only` | No | If `true`, skip the agent entirely — the rendered `prompt` template becomes the literal message that gets delivered. Zero LLM cost, sub-second delivery. Requires `deliver` to be a real target (not `log`). |

## Delivery targets

The `deliver` field controls where the agent's response goes after processing
the webhook event.

| Value | Description |
|-------|-------------|
| `log` | Logs the response to the gateway log output. Default; useful for testing. |
| `github_comment` | Posts the response as a PR/issue comment via the `gh` CLI. Requires `deliver_extra.repo` and `deliver_extra.pr_number`. The `gh` CLI must be installed and authenticated on the gateway host. |
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

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WEBHOOK_ENABLED` | Enable the webhook platform adapter. | `false` |
| `WEBHOOK_PORT` | HTTP server port for receiving webhooks. | `8644` |
| `WEBHOOK_SECRET` | Global HMAC secret used for signature validation on all routes. Set via environment variable, not `config.yaml`, to avoid exposing credentials in plain text. | _(none)_ |

## Example

```yaml
platforms:
  webhook:
    enabled: true
    extra:
      port: 8644
      routes:
        github-pr:
          events: ["pull_request"]
          prompt: |
            Review this pull request:
            Repository: {repository.full_name}
            PR #{number}: {pull_request.title}
            Author: {pull_request.user.login}
            URL: {pull_request.html_url}
            Diff URL: {pull_request.diff_url}
            Action: {action}
          skills: ["github-code-review"]
          deliver: "github_comment"
          deliver_extra:
            repo: "{repository.full_name}"
            pr_number: "{number}"
```

The HMAC secret is provided via the `WEBHOOK_SECRET` environment variable.