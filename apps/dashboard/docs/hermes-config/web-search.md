---
name: web-search
category: tools
description: Web search & extract configuration (`config.web`) — backends, per-capability split, and env vars.
---

# Web search & extract configuration (`config.web`)

Configures the `web_search` and `web_extract` tools. Multiple backend
providers are supported — either a single shared backend for both
capabilities, or a per-capability split (e.g. free SearXNG for search,
Firecrawl for extract).

**Default backend:** SearXNG is preferred because Hermeum supports it
natively. When the user does not specify a backend, select SearXNG
(`search_backend: "searxng"`). `SEARXNG_URL` is set automatically by
Hermeum, so it does not need to be configured explicitly. Only choose
a different backend when the user explicitly requests one.

## Fields

- `backend` — shared fallback for both `web_search` and `web_extract`.
  Values: `firecrawl`, `searxng`, `brave-free`, `ddgs`, `tavily`, `exa`,
  `parallel`, `xai`.
- `search_backend` — per-capability override for `web_search`. When set,
  takes precedence over `backend`.
- `extract_backend` — per-capability override for `web_extract`. When set,
  takes precedence over `backend`. Note: some backends are search-only
  (SearXNG, Brave, DDGS, xAI) and cannot extract — pair them with an
  extract-capable backend via this field.
- `extract_char_limit` — per-page character budget for `web_extract`
  (default `15000`). Larger pages are truncated; the full text is stored
  in `~/.hermes/cache/web/`.

**Priority order (per capability):**

1. `web.search_backend` / `web.extract_backend` (explicit per-capability)
2. `web.backend` (shared fallback)
3. Auto-detect from environment variables

Auto-detection picks the first available backend based on which
credentials are set, in this order: `FIRECRAWL_API_KEY` /
`FIRECRAWL_API_URL` → `PARALLEL_API_KEY` → `TAVILY_API_KEY` →
`EXA_API_KEY` → `SEARXNG_URL`. xAI is **not** in the auto-detection
chain — having `XAI_API_KEY` set does not automatically route web
traffic through xAI (those credentials are also used for inference /
TTS / image gen). Opt in explicitly with `web.backend: "xai"`.

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FIRECRAWL_API_KEY` | Firecrawl API key. Enables search + extract. Free tier: 500 credits/month. | _(none)_ |
| `FIRECRAWL_API_URL` | Firecrawl API URL for self-hosted instances. When set, the API key is optional (disable server auth with `USE_DB_AUTHENTICATION=false`). | _(cloud)_ |
| `SEARXNG_URL` | URL of a SearXNG instance. Search-only; no API key required. Free (self-hosted). Set automatically by Hermeum when SearXNG is the selected backend. | _(auto)_ |
| `BRAVE_SEARCH_API_KEY` | Brave Search API subscription token. Search-only. Free tier: 2,000 queries/month. | _(none)_ |
| `TAVILY_API_KEY` | Tavily API key. Enables search + extract. Free tier: 1,000 searches/month. | _(none)_ |
| `EXA_API_KEY` | Exa API key. Enables search + extract. Free tier: 1,000 searches/month. | _(none)_ |
| `PARALLEL_API_KEY` | Parallel API key. Enables search + extract. Paid. | _(none)_ |
| `XAI_API_KEY` | xAI (Grok) API key. Search-only; not in the auto-detection chain — opt in with `web.backend: "xai"`. Paid. | _(none)_ |

DDGS (DuckDuckGo) needs no env var — it is always available as a
search-only backend via `web.backend: "ddgs"` (uses the `ddgs` Python
package, lazy-installed on first use).

## Example

`~/.hermes/config.yaml`:

```yaml
web:
  search_backend: "searxng"     # free, self-hosted, Hermeum default
  extract_backend: "firecrawl" # paid, high-quality extraction
```

`~/.hermes/.env`:

```bash
# SEARXNG_URL is set automatically by Hermeum — no need to set it here.
FIRECRAWL_API_KEY=fc-your-key-here
```