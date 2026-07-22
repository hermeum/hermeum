---
name: browser
category: tools
description: Browser automation configuration (`config.browser`) — providers, timeouts, Camofox, and env vars.
---

# Browser automation configuration (`config.browser`)

Configures the `browser_*` toolset. Multiple backends are supported —
cloud providers (Browserbase, Browser Use, Firecrawl), local
Chromium-family browsers via CDP (`/browser connect` or `cdp_url`),
Camofox (local anti-detection Firefox), or the local `agent-browser`
CLI driving a local Chromium install.

**Default backend:** Camofox is preferred because Hermeum supports it
natively. When the user does not specify a backend, select Camofox.
`CAMOFOX_URL` and `CAMOFOX_API_KEY` are set automatically by Hermeum,
so they do not need to be configured explicitly. Only choose a
different backend when the user explicitly requests one.

## Fields

- `cloud_provider` — explicitly selects the browser backend. Values:
  `camofox` (Hermeum default — local anti-detection Firefox),
  `browserbase`, `browser-use`, `firecrawl`, `local`. When set to
  `local`, cloud fallback is disabled and the local `agent-browser`
  CLI / CDP path is used. When unset, the backend is auto-detected
  from credentials (Browser Use → Browserbase). Selecting `camofox`
  routes all browser tools through the Camofox server; `CAMOFOX_URL`
  and `CAMOFOX_API_KEY` are set automatically by Hermeum.
- `inactivity_timeout` — seconds of inactivity before a browser session
  is auto-cleaned up (default `120`).
- `command_timeout` — timeout in seconds for individual browser commands
  (screenshot, navigate, etc.) (default `30`).
- `record_sessions` — auto-record browser sessions as WebM videos to
  `~/.hermes/browser_recordings/` (default `false`). Recordings older
  than 72 hours are auto-cleaned.
- `allow_private_urls` — allow navigating to private/internal IPs
  (`localhost`, `127.0.0.1`, `192.168.x.x`, `10.x.x.x`, etc.)
  (default `false`).
- `engine` — browser engine for local mode: `auto` (default Chrome),
  `lightpanda` (faster, no screenshots), `chrome` (default `auto`).
  Also settable via `AGENT_BROWSER_ENGINE`.
- `auto_local_for_private_urls` — when a cloud provider is configured,
  auto-spawn a local Chromium sidecar for LAN/loopback URLs instead of
  sending them to the cloud (default `true`). Public URLs continue to
  use the cloud provider in the same conversation.
- `cdp_url` — optional persistent CDP endpoint for attaching to an
  existing Chromium/Chrome instance. When set, `browser_cdp` and the
  CDP supervisor are available.
- `allow_unsafe_evaluate` — allow `browser_console(expression=...)` to
  use sensitive JS primitives (cookies/storage/clipboard/network/form
  values) (default `false`).
- `dialog_policy` — how native JS dialogs (`alert`/`confirm`/`prompt`/
  `beforeunload`) are handled: `must_respond` (default; surface in
  snapshot, wait for explicit `browser_dialog()` call, safety
  auto-dismiss after `dialog_timeout_s`), `auto_dismiss`, or
  `auto_accept`.
- `dialog_timeout_s` — safety auto-dismiss timeout under
  `must_respond` (default `300`).
- `camofox.managed_persistence` — send a stable profile-scoped
  `userId` to Camofox so cookies/logins survive across agent restarts
  (default `false`).
- `camofox.user_id` — Camofox `userId` for externally managed sessions.
  Setting this opts the session into "externally managed" mode
  (Hermes skips destructive cleanup and `DELETE /sessions/<id>`).
- `camofox.session_key` — `sessionKey` (a.k.a. `listItemId`) sent on
  tab creation; used to match an existing tab during adoption.
- `camofox.adopt_existing_tab` — when `true`, Hermes calls
  `GET /tabs?userId=<user_id>` on first use and reuses an existing tab
  before creating a new one (default `false`).
- `camofox.rewrite_loopback_urls` — rewrite loopback page URLs
  (`localhost`/`127.0.0.1`/`::1`) to `loopback_host_alias` when Camofox
  runs in Docker (default `false`). Only applies to page navigation
  URLs; `CAMOFOX_URL` itself is unchanged.
- `camofox.loopback_host_alias` — host alias for loopback rewriting
  (default `host.docker.internal`).

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BROWSERBASE_API_KEY` | Browserbase API key for cloud browser. | _(none)_ |
| `BROWSERBASE_PROJECT_ID` | Browserbase project ID (required with `BROWSERBASE_API_KEY` for cloud browser). | _(none)_ |
| `BROWSER_USE_API_KEY` | Browser Use API key for cloud browser. Browserbase takes priority if both are set. | _(none)_ |
| `FIRECRAWL_API_KEY` | Firecrawl API key. Enables Firecrawl as a cloud browser provider. | _(none)_ |
| `FIRECRAWL_API_URL` | Firecrawl API URL for self-hosted instances. | _(cloud)_ |
| `FIRECRAWL_BROWSER_TTL` | Firecrawl browser session TTL in seconds. | `300` |
| `CAMOFOX_URL` | Camofox browser server URL for local anti-detection browsing. Set automatically by Hermeum when Camofox is the selected backend. | _(auto)_ |
| `CAMOFOX_API_KEY` | Optional bearer token sent as `Authorization` header to a remote/authenticated Camofox server. Set automatically by Hermeum when Camofox is the selected backend. | _(auto)_ |
| `CAMOFOX_USER_ID` | Env-var mirror of `browser.camofox.user_id`. Takes precedence over `config.yaml`. | _(none)_ |
| `CAMOFOX_SESSION_KEY` | Env-var mirror of `browser.camofox.session_key`. Takes precedence over `config.yaml`. | _(none)_ |
| `CAMOFOX_ADOPT_EXISTING_TAB` | Env-var mirror of `browser.camofox.adopt_existing_tab`. Takes precedence over `config.yaml`. | _(none)_ |
| `CAMOFOX_REWRITE_LOOPBACK_URLS` | Env-var mirror of `browser.camofox.rewrite_loopback_urls`. Takes precedence over `config.yaml`. | _(none)_ |
| `CAMOFOX_LOOPBACK_HOST_ALIAS` | Env-var mirror of `browser.camofox.loopback_host_alias`. Takes precedence over `config.yaml`. | `host.docker.internal` |
| `AGENT_BROWSER_ENGINE` | Env-var mirror of `browser.engine`: `auto`, `lightpanda`, `chrome`. | `auto` |
| `AGENT_BROWSER_ARGS` | Extra Chromium launch flags (comma- or newline-separated). Hermes auto-injects `--no-sandbox,--disable-dev-shm-usage` when it detects root or AppArmor-restricted unprivileged user namespaces, so most users don't need to set this. | _(none)_ |
| `BROWSER_INACTIVITY_TIMEOUT` | Env-var mirror of `browser.inactivity_timeout`. | `120` |
| `BROWSERBASE_PROXIES` | Enable residential proxies for better CAPTCHA solving (Browserbase). | `true` |
| `BROWSERBASE_ADVANCED_STEALTH` | Advanced stealth with custom Chromium build (requires Browserbase Scale Plan). | `false` |
| `BROWSERBASE_KEEP_ALIVE` | Session reconnection after disconnects (requires Browserbase paid plan). | `true` |
| `BROWSERBASE_SESSION_TIMEOUT` | Custom Browserbase session timeout in seconds (max `21600` = 6 hours). | _(project default)_ |

## Example

### Camofox with managed persistence and loopback rewriting

```yaml
config:
  browser:
    dialog_policy: must_respond
    camofox:
      managed_persistence: true
      rewrite_loopback_urls: true
```

`CAMOFOX_URL` and `CAMOFOX_API_KEY` are set automatically by Hermeum —
no need to add them to `env`.
