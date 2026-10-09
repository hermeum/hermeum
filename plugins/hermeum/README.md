# hermeum (hermes plugin)

A [hermes-agent](../../../vendor/hermes-agent) plugin that forwards agent-session
events (`session_started`, `llm_call`, `tool_call`, `error`, `session_finalized`,
`subagent_started`, `subagent_stopped`) to Hermeum's plugin-protocol endpoint
(`POST /plugin/trpc/agentSession.agentSessionEvents`).

Post-only events: every event is a completed record (input, output, duration,
usage arrive together); no event is emitted pre-call. The `pre_api_request`
hook is registered only to stash the turn's user_message (the post-api hook
carries no request side — langfuse reads it from the same pre hook), consumed
by the next `llm_call` of that turn. Events are
constructed as the typed payloads generated from Hermeum's event schema
(`openapi/plugin.json`), mirroring the bundled langfuse observability plugin's
field extraction. Content is captured sanitized (default, like langfuse):
secret redaction before truncation (12000 chars, `HERMEUM_PLUGIN_MAX_CHARS`).
Cost is not computed client-side — `totalUsd` is always null; Hermeum
estimates server-side.

## Layout

```
plugins/hermeum/
├── plugin.yaml            # hermes plugin manifest
├── __init__.py            # register(ctx) — hook registration only
├── telemetry.py           # event-building business logic + typed event buffering + ≤100-event batch flush
└── client/
    ├── requirements.txt   # runtime deps for the generated client
    └── openapi_client/    # generated client, vendored (source only)
```

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
| `post_api_request` | `llm_call` | `userMessage`, `usage`, `assistant` (content/reasoning/toolCalls), `durationS`, `finishReason`, `moaReferences?` |
| `post_tool_call` | `tool_call` | `toolName`, `toolCallId`, `args`, `result`, `durationS` (from `duration_ms`), `status` (`ok`/`error`/`blocked`/`cancelled`) |
| `api_request_error` | `error` | `stage: "llm"`, `message` (≤200 chars, from structured `error`/`reason`) |
| `on_session_finalize` | `session_finalized` | `output` — the last assistant output seen in the session, then flush |
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
| `HERMEUM_PLUGIN_MAX_CHARS` | `12000` | Max chars per redacted text field before truncation. |

## Local verification

Against the app dev server (`HERMEUM_MOCK_RUNTIME=true pnpm --filter @hermeum/app dev`):

```sh
python -m venv .venv && .venv/bin/pip install -r plugins/hermeum/client/requirements.txt
.venv/bin/python -c "
import sys, uuid
sys.path.insert(0, 'plugins/hermeum')
from telemetry import HermeumTelemetry, ToolCallEvent
from datetime import datetime, timezone
t = HermeumTelemetry('http://localhost:3000/plugin/trpc')
print('health:', t.health_check())
t.record(ToolCallEvent(event_id=str(uuid.uuid4()), type='tool_call',
    timestamp=datetime.now(timezone.utc).isoformat(),
    tool_name='ping', tool_call_id='tc_1', args={'k': 'v'}, result='ok'))
t.flush()
"
```