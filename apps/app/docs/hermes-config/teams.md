---
name: teams
category: platforms
description: Microsoft Teams bot configuration.
---

# Microsoft Teams configuration

Exposes hermes-agent as a Microsoft Teams bot. Teams delivers messages by
calling a public HTTPS webhook at `/api/messages`, so the agent needs a
publicly reachable endpoint — either a dev tunnel (local dev) or a real
domain (production). Unlike Slack's Socket Mode, Teams is an HTTP-webhook
platform.

**You must configure Microsoft Teams on the Azure/Teams side before this
bot will work** — bot registration, messaging endpoint, and app
installation. This is not optional. Complete that setup by following
the official Hermes Agent guide at
https://hermes-agent.nousresearch.com/docs/user-guide/messaging/teams.
The env vars and `config.yaml` knobs below assume the Teams-side setup
is already done; without it, the webhook will receive no messages.

## Configuration

Teams is enabled when the three credentials are present as environment
variables (`TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_TENANT_ID`).
Credentials must not be written into `config.yaml` — `config.yaml` is for
non-secret settings only. An explicit `enabled: false` disables the bot
while keeping credentials in env.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEAMS_CLIENT_ID` | _(required)_ | Azure AD App (client) ID. |
| `TEAMS_CLIENT_SECRET` | _(required)_ | Azure AD client secret. Mark `sensitive: true` in the agent env. |
| `TEAMS_TENANT_ID` | _(required)_ | Azure AD tenant ID. |
| `TEAMS_PORT` | `3978` | Webhook server port. |
| `TEAMS_ALLOWED_USERS` | _(recommended)_ | Comma-separated AAD object IDs allowed to use the bot. |
| `TEAMS_ALLOW_ALL_USERS` | _(none)_ | Set `true` to skip the allowlist and allow anyone. |

### config.yaml

Only behavioral settings live under `config.platforms.teams.extra`:

```yaml
platforms:
  teams:
    enabled: true
    extra:
      port: 3978
```

`extra.port` takes precedence over the `TEAMS_PORT` env var when both are set.

## Example

### Enabling the Teams bot with env vars

Credentials come from env vars; the config only needs to opt in:

```yaml
platforms:
  teams:
    enabled: true
env:
  - name: TEAMS_CLIENT_ID
    value: 00000000-0000-0000-0000-000000000000
  - name: TEAMS_CLIENT_SECRET
    value: change-me
    sensitive: true
  - name: TEAMS_TENANT_ID
    value: 00000000-0000-0000-0000-000000000000
  - name: TEAMS_ALLOWED_USERS
    value: 00000000-0000-0000-0000-000000000000
```

When `enabled` is omitted, Teams is auto-enabled once all three `TEAMS_*`
credentials are present — so the `platforms.teams` block above is optional
but makes the intent explicit.