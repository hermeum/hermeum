---
name: x-search
category: tools
description: X (Twitter) search configuration (`config.x_search`) — xAI Responses-backed tool, model/timeout/retries, and XAI_API_KEY env var.
---

# X (Twitter) Search configuration (`config.x_search`)

Configures the `x_search` tool, which lets the agent search X (Twitter)
posts, profiles, and threads. It is backed by xAI's built-in `x_search`
tool on the Responses API (`https://api.x.ai/v1/responses`) — Grok
runs the search server-side and returns a synthesized answer with
citations to the originating posts.

**Use `x_search` instead of `web_search`** when you specifically want
current discussion, reactions, or claims **on X**. For general web
pages, keep `web_search` / `web_extract`.

**Credential path:** only the `XAI_API_KEY` path is supported here.
SuperGrok / X Premium+ OAuth (`hermes auth add xai-oauth`) is **not**
wired up in this app yet — set `XAI_API_KEY` instead. 

The tool auto-enables when `XAI_API_KEY` is present and the `x_search`
toolset is on. Disable explicitly via `hermes tools` → Search →
`x_search` if you don't want it.

## Fields

- `model` — xAI model id used for the Responses call. Default
  `grok-4.5`; any Grok model with `x_search` tool access works. If the
  configured model lacks access, the call fails with
  "`x_search` is not enabled for this model".
- `timeout_seconds` — request timeout in seconds (minimum `30`,
  default `180`). `x_search` can take 60–120s for complex queries, so
  the default is generous.
- `retries` — number of automatic retries on `5xx` / `ReadTimeout` /
  `ConnectionError` (default `2`). Each retry backs off at `1.5 ×
  attempt` seconds, capped at `5s`.

Upstream also supports `reasoning_effort` (`low`, `medium`, `high`,
`xhigh`), which Hermeum deliberately does not surface — it passes
through if written by hand.

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `XAI_API_KEY` | Paid xAI API key — the only supported credential path in this app (set in `~/.hermes/.env`). OAuth (SuperGrok / X Premium+) is not wired up here. Without it the `x_search` tool does not register. | _(required)_ |

## Example

```yaml
config:
  x_search:
    model: grok-4.5
    timeout_seconds: 180
    retries: 2
env:
  - name: XAI_API_KEY
    value: xai-your-key-here
    sensitive: true
```