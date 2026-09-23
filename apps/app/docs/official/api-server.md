---
name: api-server
category: platforms
description: API server configuration (`gateway.api_server`) — OpenAI-compatible HTTP endpoint, config.yaml fields, and env vars.
---

# API server configuration

Exposes the agent as an OpenAI-compatible HTTP endpoint for any
OpenAI-format frontend.

## Configuration

The API server can be configured through either `config.gateway.api_server`
(`enabled`, `port`) **or** env vars (`API_SERVER_ENABLED`,
`API_SERVER_PORT`). Environment variables take precedence over the
`config.yaml` values when both are set; the config block acts as a
fallback for deployments that prefer `config.yaml`. The bearer token is
env-only (`API_SERVER_KEY`, sensitive) — see [Secrets](#secrets).

### config.yaml

Settings live under `config.gateway.api_server` (flat fields, matching the
upstream block):

- `enabled` — whether the API server is enabled (bool).
- `port` — HTTP server port (default `8642`).
- `host` — bind address. Defaults to localhost only (`127.0.0.1`); set
  to `0.0.0.0` to expose on a LAN.
- `cors_origins` — comma-separated allowed browser origins. Required
  only if a browser must call Hermes directly.
- `model_name` — model name advertised on `/v1/models`. Defaults to the
  profile name.
- `max_concurrent_runs` — concurrent-run cap across the endpoints that
  start a run directly: the OpenAI-compatible endpoints, the Runs
  endpoints, and the session-chat endpoints (`POST
  /api/sessions/{id}/chat` and its `/stream` variant). Cron-triggered
  runs (`POST /api/jobs/{id}/run`, `POST /api/cron/fire`) go through the
  cron scheduler and are governed by cron's own limits, not this cap
  (default `10`; `0` disables the limit — new run-starting requests get
  HTTP 429 when the cap is reached).
- `history_tool_output_max_chars` — cap each tool output and each string
  tool-call argument in the **stored** `/v1/responses` history at this
  many characters; anything longer is cut to the head plus a
  `...[N more chars]` marker (default `0` = store verbatim). User and
  assistant text is never touched, and the `response.completed` payload
  and incremental SSE events are unaffected. Because the stored history
  is what the model sees on the next chained turn, enabling the cap also
  trims what the model is replayed — leave it at `0` if your workflow
  needs complete tool outputs across turns.

## Secrets

The bearer token is **env-only**: set it as the `API_SERVER_KEY` env entry
(marked `sensitive: true`) — never write the literal token into
`config.yaml`.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_SERVER_ENABLED` | `false` | Enable the API server. Takes precedence over `gateway.api_server.enabled`. |
| `API_SERVER_PORT` | `8642` | HTTP server port. Takes precedence over `gateway.api_server.port`. |
| `API_SERVER_HOST` | `127.0.0.1` | Bind address. Defaults to localhost only; set to `0.0.0.0` to expose on a LAN. |
| `API_SERVER_KEY` | _(required)_ | Bearer token for auth. Required for every deployment, including loopback. Set it as a sensitive env entry. |
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
      port: 8642
env:
  - name: API_SERVER_KEY
    value: change-me-local-dev
    sensitive: true
```

The `gateway.api_server` block is optional — omitting it and setting
`API_SERVER_ENABLED=true` + `API_SERVER_PORT` via env vars works the
same way. When both are set, the env vars win. The bearer token is
required for every deployment: set it as the sensitive `API_SERVER_KEY`
env entry — never in `config.yaml` (see [Secrets](#secrets)).