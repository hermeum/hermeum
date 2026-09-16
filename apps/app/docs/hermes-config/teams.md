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
The `config.yaml` knobs below assume the Teams-side setup is already
done; without it, the webhook will receive no messages.

## Configuration

Both configuration paths are supported: env vars (`TEAMS_CLIENT_ID`,
`TEAMS_CLIENT_SECRET`, `TEAMS_TENANT_ID`) and
`platforms.teams.extra` in `config.yaml` — Hermeum prefers the config
path. `client_secret` is set as an env var reference
(`client_secret: ${TEAMS_CLIENT_SECRET}`) — hermes substitutes it from the
sensitive `TEAMS_CLIENT_SECRET` env entry at config load. An explicit
`enabled: false` disables the bot while keeping credentials in place.

### Secret references

Hermes supports env var substitution in `config.yaml`: `${VAR_NAME}` is
replaced with the value of the env var at config load; an unresolved
reference is kept verbatim and logged as a warning.

```yaml
platforms:
  teams:
    extra:
      client_secret: ${TEAMS_CLIENT_SECRET}
```

The referenced env entry (`TEAMS_CLIENT_SECRET` here) carries the actual
secret value and must be marked `sensitive: true` — never write the literal
secret into `config.yaml`. The referenced name is not reserved:
`client_secret: ${EXAMPLE}` is equally valid as long as `EXAMPLE` exists in
the agent's env field.

### config.yaml

The `platforms.teams.extra` block carries the credentials, including the
`client_secret` reference:

```yaml
platforms:
  teams:
    enabled: true
    extra:
      client_id: 00000000-0000-0000-0000-000000000000
      client_secret: ${TEAMS_CLIENT_SECRET}
      tenant_id: 00000000-0000-0000-0000-000000000000
      port: 3978
```

`extra.port` takes precedence over the `TEAMS_PORT` env var when both are set.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEAMS_CLIENT_ID` | _(required in config or env)_ | Azure AD App (client) ID. |
| `TEAMS_CLIENT_SECRET` | _(required)_ | Azure AD client secret. Referenced from `platforms.teams.extra.client_secret` via `${TEAMS_CLIENT_SECRET}` substitution; the literal value lives here, marked `sensitive: true`. |
| `TEAMS_TENANT_ID` | _(required in config or env)_ | Azure AD tenant ID. |
| `TEAMS_PORT` | `3978` | Webhook server port. |
| `TEAMS_ALLOWED_USERS` | _(recommended)_ | Comma-separated AAD object IDs allowed to use the bot. |
| `TEAMS_ALLOW_ALL_USERS` | _(none)_ | Set `true` to skip the allowlist and allow anyone. |

## Example

### Enabling the Teams bot

Credentials are set in config; the client secret value comes from the
sensitive env entry:

```yaml
platforms:
  teams:
    enabled: true
    extra:
      client_id: 00000000-0000-0000-0000-000000000000
      client_secret: ${TEAMS_CLIENT_SECRET}
      tenant_id: 00000000-0000-0000-0000-000000000000
env:
  - name: TEAMS_CLIENT_SECRET
    value: change-me
    sensitive: true
  - name: TEAMS_ALLOWED_USERS
    value: 00000000-0000-0000-0000-000000000000
```

Alternatively, all three credentials can come from env vars (`TEAMS_CLIENT_ID`,
`TEAMS_CLIENT_SECRET`, `TEAMS_TENANT_ID`) — Teams auto-enables when they are
all present, but Hermeum prefers the config path.

When `enabled` is omitted, Teams is auto-enabled once all three
credentials are present — so the `platforms.teams` block above is optional
but makes the intent explicit.