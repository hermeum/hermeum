# Generated Python client (plugin/hermeum/client/openapi_client) — regenerate with:
#   npx @openapitools/openapi-generator-cli@latest generate \
#     -i openapi/plugin.json -g python -o plugin/hermeum/client \
#     --library urllib3 --skip-validate-spec \
#     --additional-properties=generateSourceCodeOnly=true
# Runtime deps required by the generated client (not pip-installed; vendored via sys.path):
#   urllib3 >= 2.7.0, pydantic >= 2.11, python_dateutil >= 2.8.2, typing-extensions >= 4.7.1

from __future__ import annotations

import json
import logging
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_CLIENT_PARENT = Path(__file__).resolve().parent / "client"
sys.path.insert(0, str(_CLIENT_PARENT))

from openapi_client import ApiClient, Configuration  # noqa: E402
from openapi_client.api.agent_session_api import AgentSessionApi  # noqa: E402
from openapi_client.models.agent_session_agent_session_events_request import (  # noqa: E402
    AgentSessionAgentSessionEventsRequest,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInner,
)

log = logging.getLogger("hermeum.telemetry")

FLUSH_THRESHOLD = 100


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class HermeumTelemetry:
    """Buffers hermes agent-session events and batches them to Hermeum's
    plugin-protocol ingest endpoint. Hook callbacks never raise."""

    def __init__(self, base_url: str) -> None:
        configuration = Configuration(host=base_url)
        self._api = AgentSessionApi(ApiClient(configuration))
        self._session_id = str(uuid.uuid4())
        self._buffer: list[AgentSessionAgentSessionEventsRequestEventsInner] = []

    def health_check(self) -> bool:
        try:
            response = self._api.agent_session_health()
            return bool(response.result.data.ok)  # type: ignore[union-attr]
        except Exception:
            log.warning("[hermeum-telemetry] health check failed", exc_info=True)
            return False

    def record(self, type_: str, data: dict[str, Any] | None = None, **kwargs: Any) -> None:
        event = AgentSessionAgentSessionEventsRequestEventsInner(
            event_id=str(uuid.uuid4()),
            type=type_,
            timestamp=_iso_now(),
            data=data if data is not None else _strip_internal(kwargs),
        )
        self._buffer.append(event)
        if len(self._buffer) >= FLUSH_THRESHOLD:
            self.flush()

    def flush(self) -> None:
        if not self._buffer:
            return
        batch, self._buffer = self._buffer[:FLUSH_THRESHOLD], self._buffer[FLUSH_THRESHOLD:]
        try:
            response = self._api.agent_session_agent_session_events(
                AgentSessionAgentSessionEventsRequest(
                    session_id=self._session_id,
                    events=batch,
                )
            )
            log.debug(
                "[hermeum-telemetry] flushed %s of %s events (server accepted %s; kwargs sample: %s)",
                len(batch),
                len(batch) + len(self._buffer),
                response.result.data.accepted,  # type: ignore[union-attr]
                _loggable_kwargs(),
            )
        except Exception:
            log.warning("[hermeum-telemetry] failed to flush %s events", len(batch), exc_info=True)


def _strip_internal(kwargs: dict[str, Any] | None) -> dict[str, Any]:
    if not kwargs:
        return {}

    def _clean(value: Any) -> Any:
        try:
            return json.loads(json.dumps(value, default=repr))
        except Exception:
            return repr(value)

    return {key: _clean(value) for key, value in kwargs.items() if not key.startswith("_")}


def _loggable_kwargs() -> str:
    return ""


def create_telemetry(base_url: str) -> HermeumTelemetry:
    return HermeumTelemetry(base_url)