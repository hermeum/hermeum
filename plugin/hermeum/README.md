# hermeum (hermes plugin)

A [hermes-agent](../../../vendor/hermes-agent) plugin that forwards agent-session
events (`session_started`, `message`, `tool_call`, `llm_call`, `error`) to
Hermeum's plugin-protocol endpoint
(`POST /plugin/trpc/agentSession.agentSessionEvents`).

## Layout

```
plugin/hermeum/
├── plugin.yaml            # hermes plugin manifest
├── __init__.py            # register(ctx) — hook wiring
├── telemetry.py           # event buffering + ≤100-event batch flush
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
  -i openapi/plugin.json -g python -o plugin/hermeum/client \
  --library urllib3 --skip-validate-spec \
  --additional-properties=generateSourceCodeOnly=true
```

`generateSourceCodeOnly=true` emits just the `openapi_client/` package — it
skips CI boilerplate (GitHub Actions, Travis, GitLab CI), packaging files
(`setup.py`, `pyproject.toml`), tests, and docs. If the generator re-creates
its inside-package `docs/`/`test/` stubs or `.openapi-generator-ignore`, delete
them:

```sh
rm -rf plugin/hermeum/client/openapi_client/docs \
       plugin/hermeum/client/openapi_client/test \
       plugin/hermeum/client/.openapi-generator-ignore
```

`client/requirements.txt` is not generated — it is maintained by hand. If the
generated client's imports change, sync it against the imports in
`client/openapi_client/` (currently: `urllib3`, `pydantic`,
`python_dateutil`, `typing-extensions`).

## Installation (hermes-agent)

```sh
ln -s "$PWD/plugin/hermeum" ~/.hermes/plugins/hermeum
hermes plugins enable hermeum
```

## Configuration

| Env var | Default | Description |
|---|---|---|
| `HERMEUM_TELEMETRY_URL` | `http://localhost:3000/plugin/trpc` | Base URL of the Hermeum plugin-protocol endpoint. |

Hook callbacks never raise: flush failures are logged and dropped so agent
operation is unaffected.

## Local verification

Against the app dev server (`HERMEUM_MOCK_RUNTIME=true pnpm --filter @hermeum/app dev`):

```sh
python -m venv .venv && .venv/bin/pip install -r plugin/hermeum/client/requirements.txt
.venv/bin/python -c "
import sys; sys.path.insert(0, 'plugin/hermeum')
from telemetry import HermeumTelemetry
t = HermeumTelemetry('http://localhost:3000/plugin/trpc')
print('health:', t.health_check())
t.record('session_started', {'test': True})
t.flush()
"
```