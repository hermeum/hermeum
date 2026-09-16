---
name: api-server
category: platforms
description: API server configuration (`gateway.api_server`) — OpenAI-compatible HTTP endpoint, config.yaml fields, and env vars.
---

# API server configuration

Exposes hermes-agent as an OpenAI-compatible HTTP endpoint. Any frontend that
speaks the OpenAI format — Open WebUI, LobeChat, LibreChat, NextChat, ChatBox,
and hundreds more — can connect and use the agent as a backend with its full
toolset (terminal, file operations, web search, memory, skills).

## Configuration

The API server can be configured through either `config.gateway.api_server`
(`enabled`, `port`) **or** env vars (`API_SERVER_ENABLED`,
`API_SERVER_PORT`). Environment variables take precedence over the
`config.yaml` values when both are set; the config block acts as a
fallback for deployments that prefer `config.yaml`. Hermeum prefers
authoring through `config.yaml` — the secret is always set there as an
env var reference (see [Secret references](#secret-references)).

### config.yaml

Settings live under `config.gateway.api_server` (flat fields, matching the
upstream block):

- `enabled` — whether the API server is enabled (bool).
- `key` — bearer token for auth, as an env var reference
  (`key: ${API_SERVER_KEY}`). See [Secret references](#secret-references).
- `port` — HTTP server port (default `8642`).
- `host` — bind address. Defaults to localhost only (`127.0.0.1`); set
  to `0.0.0.0` to expose on a LAN.
- `cors_origins` — comma-separated allowed browser origins. Required
  only if a browser must call Hermes directly.
- `model_name` — model name advertised on `/v1/models`. Defaults to the
  profile name.
- `max_concurrent_runs` — concurrent-run cap across the
  OpenAI-compatible and Runs endpoints (default `10`; `0` disables the
  limit — new run-starting requests get HTTP 429 when the cap is
  reached).

## Secret references

The bearer token is required in `config.yaml` as an env var reference, not
as a literal value. Hermes supports env var substitution in `config.yaml`:
`${VAR_NAME}` is replaced with the value of the env var at config load; an
unresolved reference is kept verbatim and logged as a warning.

```yaml
gateway:
  api_server:
    key: ${API_SERVER_KEY}
```

The referenced env entry (`API_SERVER_KEY` here) carries the actual token
and must be marked `sensitive: true` — never write the literal secret into
`config.yaml`. The referenced name is not reserved: `key: ${EXAMPLE}` is
equally valid as long as `EXAMPLE` exists in the agent's env field

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_SERVER_ENABLED` | `false` | Enable the API server. Takes precedence over `gateway.api_server.enabled`. |
| `API_SERVER_PORT` | `8642` | HTTP server port. Takes precedence over `gateway.api_server.port`. |
| `API_SERVER_HOST` | `127.0.0.1` | Bind address. Defaults to localhost only; set to `0.0.0.0` to expose on a LAN. |
| `API_SERVER_KEY` | _(required)_ | Bearer token for auth. Required for every deployment, including loopback. |
| `API_SERVER_CORS_ORIGINS` | _(none)_ | Comma-separated allowed browser origins. Required only if a browser must call Hermes directly. |
| `API_SERVER_MODEL_NAME` | _(profile name)_ | Model name advertised on `/v1/models`. Defaults to the profile name, or `hermes-agent` for the default profile. |

Upstream also exposes an authenticated `/api/model/options` endpoint for
Hermes-aware UIs; it is outside the surface Hermeum configures.

## Example

### Full `gateway.api_server` block

```yaml
config:
  gateway:
    api_server:
      enabled: true
      key: ${API_SERVER_KEY}
      port: 8642
      host: 127.0.0.1
      cors_origins: http://localhost:3000
      model_name: my-hermes
      max_concurrent_runs: 10
env:
  - name: API_SERVER_KEY
    value: change-me-local-dev
    sensitive: true
```

### Enabling the API server with an auth key

```yaml
config:
  gateway:
    api_server:
      enabled: true
      key: ${API_SERVER_KEY}
      port: 8642
env:
  - name: API_SERVER_KEY
    value: change-me-local-dev
    sensitive: true
```

The `gateway.api_server` block is optional — omitting it and setting
`API_SERVER_ENABLED=true` + `API_SERVER_PORT` via env vars works the
same way. When both are set, the env vars win. The bearer token is
required for every deployment: set it in config as
`key: ${API_SERVER_KEY}`, with the literal value in the sensitive
`API_SERVER_KEY` env entry.