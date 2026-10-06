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
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf as SessionStartedEvent,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of1 import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf1 as LlmCallEvent,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of1_assistant import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf1Assistant as Assistant,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of1_assistant_tool_calls_inner import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf1AssistantToolCallsInner as ToolCall,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of1_cost import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf1Cost as Cost,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of1_moa_references_inner import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf1MoaReferencesInner as MoaReference,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of1_usage import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf1Usage as Usage,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of2 import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf2 as ToolCallEvent,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of3 import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf3 as ErrorEvent,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of4 import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf4 as SessionFinalizedEvent,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of5 import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf5 as SubagentStartedEvent,
)
from openapi_client.models.agent_session_agent_session_events_request_events_inner_one_of6 import (  # noqa: E402
    AgentSessionAgentSessionEventsRequestEventsInnerOneOf6 as SubagentStoppedEvent,
)

log = logging.getLogger("hermeum.telemetry")

FLUSH_THRESHOLD = 100

# Mirrors the langfuse plugin's sanitized capture mode (HERMES_LANGFUSE_MAX_CHARS).
MAX_CHARS = 12000


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _loggable_kwargs() -> str:
    return ""


class HermeumTelemetry:
    """Buffers typed hermes agent-session events and batches them to Hermeum's
    plugin-protocol ingest endpoint. Hook callbacks never raise."""

    def __init__(self, base_url: str) -> None:
        configuration = Configuration(host=base_url)
        self._api = AgentSessionApi(ApiClient(configuration))
        self._session_id = str(uuid.uuid4())
        self._buffer: list[AgentSessionAgentSessionEventsRequestEventsInner] = []

    def bind_session(self, session_id: str) -> None:
        """Adopt the hermes-provided session id when the first hook carries one."""
        if session_id and self._session_id != session_id:
            # A batch's events must all share one sessionId, the buffer is
            # keyed to whichever session id was in effect when recorded.
            if self._buffer:
                self.flush()
            self._session_id = session_id

    def health_check(self) -> bool:
        try:
            response = self._api.agent_session_health()
            return bool(response.result.data.ok)  # type: ignore[union-attr]
        except Exception:
            log.warning("[hermeum-telemetry] health check failed", exc_info=True)
            return False

    def record(self, event: AgentSessionAgentSessionEventsRequestEventsInner) -> None:
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
                    # oneOf wrapper: pydantic rejects the bare OneOf* members,
                    # so wrap each concrete event in the union model.
                    events=[AgentSessionAgentSessionEventsRequestEventsInner(e) for e in batch],
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
            log.warning("[hermeum-telemetry] dropped %s events", len(batch))


def _clean(value: Any) -> Any:
    """JSON-safe conversion for arbitrary hook kwargs (objects, bytes, etc.)."""
    try:
        return json.loads(json.dumps(value, default=repr))
    except Exception:
        return repr(value)


def create_telemetry(base_url: str) -> HermeumTelemetry:
    return HermeumTelemetry(base_url)