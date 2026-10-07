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
import os
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

DEFAULT_URL = "http://localhost:3000/plugin/trpc"
DEFAULT_MAX_CHARS = 12000
ERROR_MESSAGE_MAX = 200

# Tool-lifecycle outcome values from the hermes observer contract (post_tool_call.status).
TOOL_STATUSES = ("ok", "error", "blocked", "cancelled")

# Usage fields mirror the langfuse plugin's canonical usage mapping
# (canonical Hermes usage attribute -> schema field).
_USAGE_FIELDS = (
    ("input_tokens", True),
    ("output_tokens", True),
    ("cache_read_tokens", False),
    ("cache_write_tokens", False),
    ("reasoning_tokens", False),
)


# ---------------------------------------------------------------------------
# Sanitized capture (langfuse default semantics)
# ---------------------------------------------------------------------------


def _redact(value: str) -> str:
    # force=True: redact even if security.redact_secrets is disabled — this
    # content is exported to an external service (same policy as langfuse).
    try:
        from agent.redact import redact_sensitive_text

        return redact_sensitive_text(value, force=True)
    except Exception:
        return value


def _max_chars() -> int:
    raw = os.environ.get("HERMEUM_PLUGIN_MAX_CHARS", "").strip()
    try:
        return int(raw) if raw else DEFAULT_MAX_CHARS
    except ValueError:
        return DEFAULT_MAX_CHARS


def _sanitize(value: str) -> str:
    # Redact BEFORE truncating so a secret straddling the cut cannot leak.
    value = _redact(value)
    over = len(value) - _max_chars()
    return value if over <= 0 else value[: _max_chars()] + f"... [truncated {over} chars]"


def _maybe_parse_json_string(value: Any) -> Any:
    """Parse JSON-looking strings (model tool-call arguments, tool results)."""
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if len(stripped) < 2 or stripped[0] not in "{[":
        return value
    try:
        parsed, _ = json.JSONDecoder().raw_decode(stripped)
    except Exception:
        return value
    return parsed if isinstance(parsed, (dict, list)) else value


def _clean(value: Any) -> Any:
    """JSON-safe conversion for arbitrary hook kwargs (objects, bytes, etc.)."""
    try:
        return json.loads(json.dumps(value, default=repr))
    except Exception:
        return repr(value)


def _sanitize_value(value: Any) -> Any:
    """Sanitize a captured value: JSON-parse strings, redact, truncate."""
    value = _maybe_parse_json_string(value)
    if isinstance(value, str):
        return _sanitize(value)
    return _clean(value)


def _sanitize_text(value: Any) -> str | None:
    if value is None:
        return None
    return _sanitize(value if isinstance(value, str) else str(value))


# ---------------------------------------------------------------------------
# Field extraction (mirrors the langfuse plugin's serializers)
# ---------------------------------------------------------------------------


def _safe_str(value: Any) -> str | None:
    return None if value is None else str(value)


def _usage_from_any(raw: Any) -> Usage:
    """Canonical usage from response.usage objects or summary dicts (langfuse
    _usage_and_cost shape). Always includes input/output even when zero."""
    if raw is None:
        return Usage(input_tokens=0, output_tokens=0)

    def get(obj: Any, key: str) -> Any:
        if isinstance(obj, dict):
            return obj.get(key)
        return getattr(obj, key, None)

    fields: dict[str, int] = {}
    for key, required in _USAGE_FIELDS:
        val = get(raw, key)
        if val or required:
            fields[key] = max(0, int(val or 0))
    return Usage(**fields)


def _assistant_from(message: Any) -> Assistant:
    """Assistant output from an assistant_message object (langfuse
    _serialize_assistant_message) — content, reasoning, tool_calls."""
    if message is None:
        return Assistant(content=None, tool_calls=[])
    if isinstance(message, dict):
        tool_calls = [
            ToolCall(
                id=str(tc.get("id") or uuid.uuid4()),
                name=_safe_str(tc.get("name") or _safe_str((tc.get("function") or {}).get("name"))),
                arguments=_sanitize_value((tc.get("function") or {}).get("arguments") or tc.get("arguments")),
            )
            for tc in message.get("tool_calls") or []
            if isinstance(tc, dict)
        ]
        return Assistant(
            content=_sanitize_text(message.get("content")),
            reasoning=_sanitize_text(message.get("reasoning") or message.get("reasoning_content")),
            tool_calls=tool_calls,
        )
    tool_calls = []
    for tc in getattr(message, "tool_calls", None) or []:
        fn = getattr(tc, "function", None)
        tool_calls.append(
            ToolCall(
                id=str(getattr(tc, "id", None) or uuid.uuid4()),
                name=_safe_str(getattr(fn, "name", None)),
                arguments=_sanitize_value(getattr(fn, "arguments", None)),
            )
        )
    reasoning = next(
        (
            getattr(message, attr)
            for attr in ("reasoning", "reasoning_content", "reasoning_details")
            if getattr(message, attr, None) is not None
        ),
        None,
    )
    return Assistant(
        content=_sanitize_text(getattr(message, "content", None)),
        reasoning=_sanitize_text(reasoning),
        tool_calls=tool_calls,
    )


def _envelope(kwargs: dict[str, Any]) -> dict[str, Any]:
    """Common event fields: eventId, timestamp, turnId."""
    return {
        "event_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "turn_id": _safe_str(kwargs.get("turn_id")) or None,
    }


def _duration_s(value: Any) -> float | None:
    """Seconds (float) from post_api_request's api_duration, or
    post_tool_call's duration_ms (converted to seconds). None when untimed."""
    if not isinstance(value, (int, float)) or value <= 0:
        return None
    return round(float(value) / 1000 if value > 1000 else float(value), 3)


def _tool_status(kwargs: dict[str, Any]) -> str | None:
    status = _safe_str(kwargs.get("status"))
    return status if status in TOOL_STATUSES else None


# ---------------------------------------------------------------------------
# Telemetry engine
# ---------------------------------------------------------------------------


class HermeumTelemetry:
    """Builds typed agent-session events from hermes observer-hook kwargs and
    batches them to Hermeum's plugin-protocol ingest endpoint.

    One public method per registered hook; each never raises so hook
    callbacks cannot affect agent operation. Content is captured sanitized
    (redact before truncate). Cost is not computed here (totalUsd: null) —
    Hermeum estimates server-side. LLM spans come from the request-scoped
    post_api_request hook (usage/duration/finish_reason); post_tool_call
    provides result, duration and status. The last assistant output is kept
    so session_finalized can close the trajectory with it.
    """

    def __init__(self, base_url: str = DEFAULT_URL) -> None:
        configuration = Configuration(host=base_url)
        self._api = AgentSessionApi(ApiClient(configuration))
        self._session_id = str(uuid.uuid4())
        self._buffer: list[AgentSessionAgentSessionEventsRequestEventsInner] = []
        self._last_assistant: Assistant | None = None

    # -- lifecycle ---------------------------------------------------------

    def bind_session(self, session_id: str) -> None:
        """Adopt the hermes-provided session id; flush on switch so a batch
        never mixes sessions."""
        if session_id and self._session_id != session_id:
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

    # -- hook methods (registered per hook name; never raise) --------------

    def session_started(self, **kwargs: Any) -> None:
        self._bind(kwargs)
        self._record(lambda: SessionStartedEvent(
            **_envelope(kwargs),
            type="session_started",
            platform=_safe_str(kwargs.get("platform")) or "unknown",
            provider=_safe_str(kwargs.get("provider")) or "unknown",
            model=_safe_str(kwargs.get("model")) or "unknown",
            api_mode=_safe_str(kwargs.get("api_mode")) or "unknown",
        ))

    def llm_call(self, **kwargs: Any) -> None:
        """LLM span from the request-scoped post_api_request hook."""
        self._bind(kwargs)
        raw_usage = kwargs.get("usage")
        if raw_usage is None:
            raw_usage = getattr(kwargs.get("response"), "usage", None)
        moa_references = None
        refs = kwargs.get("moa_references")
        if isinstance(refs, list) and refs:
            moa_references = [
                MoaReference(
                    label=_safe_str(ref.get("label")) or "advisor",
                    model=_safe_str(ref.get("model")) or "unknown",
                    output=_sanitize_value(ref.get("output")),
                    usage=_usage_from_any(ref.get("usage")) if ref.get("usage") else None,
                )
                for ref in refs
                if isinstance(ref, dict)
            ]
        assistant = _assistant_from(kwargs.get("assistant_message"))
        if assistant.content or assistant.tool_calls:
            self._last_assistant = assistant
        self._record(lambda: LlmCallEvent(
            **_envelope(kwargs),
            type="llm_call",
            provider=_safe_str(kwargs.get("provider")) or "unknown",
            model=_safe_str(kwargs.get("response_model") or kwargs.get("model")) or "unknown",
            api_mode=_safe_str(kwargs.get("api_mode")) or "unknown",
            duration_s=_duration_s(kwargs.get("api_duration")),
            finish_reason=_safe_str(kwargs.get("finish_reason")) or None,
            usage=_usage_from_any(raw_usage),
            cost=Cost(total_usd=None),
            assistant=assistant,
            moa_references=moa_references,
        ))

    def tool_call(self, **kwargs: Any) -> None:
        self._bind(kwargs)
        self._record(lambda: ToolCallEvent(
            **_envelope(kwargs),
            type="tool_call",
            tool_name=_safe_str(kwargs.get("tool_name")) or "unknown",
            tool_call_id=_safe_str(kwargs.get("tool_call_id")) or str(uuid.uuid4()),
            args=_sanitize_value(kwargs.get("args")),
            result=_sanitize_value(kwargs.get("result")),
            duration_s=_duration_s(kwargs.get("duration_ms")),
            status=_tool_status(kwargs),
        ))

    def api_error(self, **kwargs: Any) -> None:
        self._bind(kwargs)
        error = kwargs.get("error")
        if isinstance(error, dict):
            error = error.get("message") or error.get("type")
        message = kwargs.get("reason") or _safe_str(error) or (str(type(error)) if error else "api_request_error")
        self._record(lambda: ErrorEvent(
            **_envelope(kwargs),
            type="error",
            stage="llm",
            message=_sanitize(message if isinstance(message, str) else str(message))[:ERROR_MESSAGE_MAX],
            provider=_safe_str(kwargs.get("provider")) or None,
            model=_safe_str(kwargs.get("model")) or None,
        ))

    def session_finalized(self, **kwargs: Any) -> None:
        self._bind(kwargs)
        self._record(lambda: SessionFinalizedEvent(
            **_envelope(kwargs),
            type="session_finalized",
            output=self._last_assistant or Assistant(content=None, tool_calls=[]),
        ))
        self.flush()

    def subagent_started(self, **kwargs: Any) -> None:
        self._subagent_event(SubagentStartedEvent, "subagent_started", kwargs)

    def subagent_stopped(self, **kwargs: Any) -> None:
        self._subagent_event(SubagentStoppedEvent, "subagent_stopped", kwargs)

    # -- internals ---------------------------------------------------------

    def _subagent_event(self, model: type, event_type: str, kwargs: dict[str, Any]) -> None:
        self._bind(kwargs)
        child_session_id = _safe_str(kwargs.get("child_session_id"))
        if not child_session_id:
            return
        self._record(lambda: model(
            event_id=str(uuid.uuid4()),
            type=event_type,
            timestamp=datetime.now(timezone.utc).isoformat(),
            turn_id=_safe_str(kwargs.get("turn_id")) or kwargs.get("parent_turn_id") or "",
            parent_turn_id=_safe_str(kwargs.get("parent_turn_id")) or None,
            child_session_id=child_session_id,
        ))

    def _bind(self, kwargs: dict[str, Any]) -> None:
        session_id = kwargs.get("session_id")
        if session_id:
            self.bind_session(str(session_id))

    def _record(self, build: Any) -> None:
        """Append the event produced by `build()`, swallowing construction
        failures so hook callbacks never raise; flush at capacity."""
        try:
            self._buffer.append(build())
            if len(self._buffer) >= FLUSH_THRESHOLD:
                self.flush()
        except Exception:
            log.warning("[hermeum-telemetry] failed to build event", exc_info=True)

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
                "[hermeum-telemetry] flushed %s events (server accepted %s)",
                len(batch),
                response.result.data.accepted,  # type: ignore[union-attr]
            )
        except Exception:
            log.warning("[hermeum-telemetry] failed to flush %s events", len(batch), exc_info=True)
            log.warning("[hermeum-telemetry] dropped %s events", len(batch))


def create_telemetry(base_url: str = DEFAULT_URL) -> HermeumTelemetry:
    return HermeumTelemetry(base_url)