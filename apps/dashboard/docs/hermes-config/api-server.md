---
name: api-server
description: API server configuration — OpenAI-compatible HTTP endpoint env vars.
---

# API server configuration

Exposes hermes-agent as an OpenAI-compatible HTTP endpoint. Any frontend that
speaks the OpenAI format — Open WebUI, LobeChat, LibreChat, NextChat, ChatBox,
and hundreds more — can connect and use the agent as a backend with its full
toolset (terminal, file operations, web search, memory, skills).

## Configuration

The API server is configured entirely through environment variables —
`config.yaml` support is not yet available. Set the env vars below on the agent
(in `~/.hermes/.env`, or a profile's `.env` for multi-instance setups).

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_SERVER_ENABLED` | `false` | Enable the API server. |
| `API_SERVER_PORT` | `8642` | HTTP server port. |
| `API_SERVER_HOST` | `127.0.0.1` | Bind address. Defaults to localhost only; set to `0.0.0.0` to expose on a LAN. |
| `API_SERVER_KEY` | _(required)_ | Bearer token for auth. Required for every deployment, including loopback. Set via env var, not `config.yaml`, to avoid exposing credentials in plain text. |
| `API_SERVER_CORS_ORIGINS` | _(none)_ | Comma-separated allowed browser origins. Required only if a browser must call Hermes directly. |
| `API_SERVER_MODEL_NAME` | _(profile name)_ | Model name advertised on `/v1/models`. Defaults to the profile name, or `hermes-agent` for the default profile. |

## Example

`~/.hermes/.env`:

```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=change-me-local-dev
# Optional: only if a browser must call Hermes directly
# API_SERVER_CORS_ORIGINS=http://localhost:3000
```