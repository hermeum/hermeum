# hermeum (hermes plugin)

A [hermes-agent](../../../vendor/hermes-agent) plugin that forwards agent-session
events (`session_started`, `llm_call`, `tool_call`, `error`, `session_finalized`,
`subagent_started`, `subagent_stopped`) to Hermeum's plugin-protocol endpoint
(`POST /plugin/trpc/agentSession.agentSessionEvents`), authenticated as the
agent's provisioned ingest token (see Configuration).

Post-only events: every event is a completed record (input, output, duration,
usage arrive together); no event is emitted pre-call. The `pre_api_request`
hook is registered only to stash the turn's user_message (the post-api hook
carries no request side — langfuse reads it from the same pre hook), consumed
by the next `llm_call` of that turn. Events are
constructed as the typed payloads generated from Hermeum's event schema
(`openapi/plugin.json`), mirroring the bundled langfuse observability plugin's
field extraction. Content is captured sanitized (default, like langfuse):
secret redaction before truncation (12000 chars, `HERMEUM_PLUGIN_MAX_CHARS`).
Cost is estimated client-side via hermes-agent's own `agent.usage_pricing`
(the module the bundled langfuse plugin uses, so pricing stays in lockstep
with the pinned submodule — no server-side estimation). Langfuse semantics:
subscription-included routes (e.g. OpenAI Codex plans) yield null, a total is
only exported when the estimate is complete, and a partial component breakdown
(`inputUsd`/`outputUsd`/`cacheReadUsd`/`cacheWriteUsd`) is never promoted to a
total. MoA advisor references carry usage only — the optional `costUsd`
field is intentionally left unpopulated.

## Layout

```
plugins/hermeum/
├── plugin.yaml            # hermes plugin manifest
├── __init__.py            # register(ctx) — hook registration only
├── telemetry.py           # event-building business logic + typed event buffering + flush (threshold/interval/atexit)
└── client/
    ├── requirements.txt   # runtime deps for the generated client
    └── openapi_client/    # generated client, vendored (source only)
```

## Flushing

Events buffer client-side and are delivered on three triggers:

1. **Threshold** — buffer reaches 100 events (`FLUSH_THRESHOLD`, the
   server-side batch cap; one batch per flush never exceeds it).
2. **Interval** — a daemon timer flushes every 30s so sub-threshold
   leavings from sparse activity don't sit in the buffer indefinitely
   (`FLUSH_INTERVAL_S` in `telemetry.py`).
3. **Finalize/exit** — `on_session_finalize` flushes after the
   `session_finalized` event; `on_session_end` (upstream: turn-scoped,
   fires after every turn) flushes without recording; `atexit` flushes
   whatever remains at normal interpreter exit (one-shot runs, cron —
   SIGTERM/SIGKILL is not covered).

Switching session ids flushes first so a batch never mixes sessions.
Failed sends are logged and dropped; the agent is never affected.

## Generating the client

The Python client is generated from the app's OpenAPI spec
(`openapi/plugin.json`, produced by `pnpm openapi:generate`). It is vendored
into this directory and imported via `sys.path`, so it does not need to be
published or pip-installed.

Regenerate from the repo root:

```sh
npx @openapitools/openapi-generator-cli@latest generate \
  -i openapi/plugin.json -g python -o plugins/hermeum/client \
  --library urllib3 --skip-validate-spec \
  --additional-properties=generateSourceCodeOnly=true
```

`generateSourceCodeOnly=true` emits just the `openapi_client/` package — it
skips CI boilerplate (GitHub Actions, Travis, GitLab CI), packaging files
(`setup.py`, `pyproject.toml`), tests, and docs. If the generator re-creates
its inside-package `docs/`/`test/` stubs, the package-level README
(`openapi_client_README.md`) or `.openapi-generator-ignore`, delete them:

```sh
rm -rf plugins/hermeum/client/openapi_client/docs \
       plugins/hermeum/client/openapi_client/test \
       plugins/hermeum/client/openapi_client_README.md \
       plugins/hermeum/client/.openapi-generator-ignore
```

`client/requirements.txt` is not generated — it is maintained by hand. If the
generated client's imports change, sync it against the imports in
`client/openapi_client/` (currently: `urllib3`, `pydantic`,
`python_dateutil`, `typing-extensions`).

## Hook → event mapping

Hook callbacks never raise; flush failures are logged and dropped so agent
operation is unaffected. Field extraction mirrors the langfuse plugin
(`_serialize_assistant_message`, canonical usage mapping, redact-before-truncate).
Hook names follow the hermes observer contract
(docs/developer-guide/observer-hooks): LLM spans come from the request-scoped
`post_api_request` (usage/`api_duration`/`finish_reason`/`response_model`),
not the turn-scoped `post_llm_call`; `post_tool_call` provides
`duration_ms` and `status`.

| Hook | Event | Key fields |
|---|---|---|
| `pre_api_request` | — (context stash) | keeps the turn's `user_message` for the next `llm_call` |
| `on_session_start` | `session_started` | `platform`, `provider`, `model`, `apiMode` |
| `post_api_request` | `llm_call` | `userMessage`, `usage`, `cost` (estimated via `agent.usage_pricing`), `assistant` (content/reasoning/toolCalls), `durationS`, `finishReason`, `moaReferences?` |
| `post_tool_call` | `tool_call` | `toolName`, `toolCallId`, `args`, `result`, `durationS` (from `duration_ms`), `status` (`ok`/`error`/`blocked`/`cancelled`) |
| `api_request_error` | `error` | `stage: "llm"`, `message` (≤200 chars, from structured `error`/`reason`) |
| `on_session_finalize` | `session_finalized` | `output` — the last assistant output seen in the session, then flush |
| `on_session_end` | — (flush only) | turn-scoped upstream (fires after every turn) — flushes without recording |
| `subagent_start` | `subagent_started` | `turnId`, `parentTurnId`, `childSessionId` |
| `subagent_stop` | `subagent_stopped` | same as started |

Batches carry the hook-provided `session_id` (fallback: a per-run uuid;
switching session ids flushes the buffer first so a batch never mixes
sessions). Every event tagged with the hook's `turn_id` when available —
the field the Hermeum trajectory UI groups by.

## Installation (hermes-agent)

```sh
ln -s "$PWD/plugins/hermeum" ~/.hermes/plugins/hermeum
hermes plugins enable hermeum
```

## Configuration

| Env var | Default | Description |
|---|---|---|
| `HERMEUM_PLUGIN_BASE_URL` | `http://localhost:3000/plugin/trpc` | Base URL of the Hermeum plugin-protocol endpoint. |
| `HERMEUM_PLUGIN_TOKEN` | — (required) | Per-agent ingest token, provisioned by Hermeum at agent-create time and presented as `Authorization: Bearer` on every request. The server is fail-closed: without a valid token every request — including the health probe — is rejected with 401. |
| `HERMEUM_PLUGIN_MAX_CHARS` | `12000` | Max chars per redacted text field before truncation. |

## Local verification

Against the app dev server (`HERMEUM_MOCK_RUNTIME=true pnpm --filter @hermeum/app dev`).
The plugin endpoint is token-guarded, so first seed an ingest token for an
agent that exists in the mock runtime (create it in the UI and copy its id):

```sh
HERMEUM_DATABASE_URL=file:./sqlite.db pnpm --filter @hermeum/app exec tsx scripts/seed-plugin-token.ts <agentId>
# prints: export HERMEUM_PLUGIN_TOKEN=hmt_...
#
# The printed token authorizes ingest for the agent — treat it like any
# other credential; don't leave it in shared logs or persistent shell history
# (with HISTCONTROL=ignorespace you can prefix the export with a space).
```

Then, with the printed token exported:

```sh
export HERMEUM_PLUGIN_TOKEN=hmt_...  # from the seed script output
python -m venv .venv && .venv/bin/pip install -r plugins/hermeum/client/requirements.txt
.venv/bin/python -c "
import os, sys
sys.path.insert(0, 'plugins/hermeum')
from telemetry import HermeumTelemetry
t = HermeumTelemetry('http://localhost:3000/plugin/trpc', token=os.environ['HERMEUM_PLUGIN_TOKEN'])
print('health:', t.health_check())
# Hook methods build the typed event payloads — no manual event construction.
t.tool_call(tool_name='ping', tool_call_id='tc_1', args={'k': 'v'}, result='ok', status='ok')
t.flush()
"
```