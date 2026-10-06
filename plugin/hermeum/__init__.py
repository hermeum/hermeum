"""Hermeum telemetry plugin.

Forwards hermes agent-session events to Hermeum's plugin-protocol endpoint
(POST /plugin/trpc/agentSession.agentSessionEvents), constructing the typed
event payloads defined by Hermeum's schema (entities/telemetry.ts — see the
event union's `oneOf` in openapi/plugin.json). Field extraction mirrors the
bundled langfuse observability plugin's post-call hook surface:

- on_session_start    -> session_started (platform/provider/model/apiMode)
- post_llm_call       -> llm_call (usage, assistant, durationS, finishReason)
- post_tool_call      -> tool_call (toolName, toolCallId, args, result)
- api_request_error   -> error (stage, message)
- on_session_finalize -> session_finalized + flush remaining buffered events
- on_subagent_start   -> subagent_started (turnId, parentTurnId, childSessionId)
- on_subagent_stop    -> subagent_stopped

Post-only: pre-call hooks are deliberately not registered — every event is a
completed record. Content is captured in a "sanitized" mode (langfuse default):
secret redaction before truncation, so a secret straddling the cut cannot leak.
Cost is not computed here (totalUsd: null) — Hermeum estimates server-side.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from .telemetry import (
    Assistant,
    Cost,
    ErrorEvent,
    HermeumTelemetry,
    LlmCallEvent,
    SessionStartedEvent,
    SessionFinalizedEvent,
    SubagentStartedEvent,
    SubagentStoppedEvent,
    ToolCall,
    ToolCallEvent,
    Usage,
    create_telemetry,
)

log = logging.getLogger("hermeum.plugin")

DEFAULT_URL = "http://localhost:3000/plugin/trpc"
DEFAULT_MAX_CHARS = 12000

# Usage keys mirror the langfuse plugin's canonical usage mapping
# (canonical Hermes usage attribute -> summary-dict key -> schema field).
_USAGE_FIELDS = (
    ("input_tokens", "inputTokens"),
    ("output_tokens", "outputTokens"),
    ("cache_read_tokens", "cacheReadTokens"),
    ("cache_write_tokens", "cacheWriteTokens"),
    ("reasoning_tokens", "reasoningTokens"),
)


def _redact(value: str) -> str:
    # force=True: redact even if security.redact_secrets is disabled — this
    # content is exported to an external service (same policy as langfuse).
    try:
        from agent.redact import redact_sensitive_text

        return redact_sensitive_text(value, force=True)
    except Exception:
        return value


def _sanitize(value: str) -> str:
    # Redact BEFORE truncating so a secret straddling the cut cannot leak.
    value = _redact(value)
    over = len(value) - _max_chars()
    return value if over <= 0 else value[: _max_chars()] + f"... [truncated {over} chars]"


def _max_chars() -> int:
    raw = os.environ.get("HERMEUM_TELEMETRY_MAX_CHARS", "").strip()
    try:
        return int(raw) if raw else DEFAULT_MAX_CHARS
    except ValueError:
        return DEFAULT_MAX_CHARS


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


def _usage_from_any(raw: Any) -> Usage:
    """Canonical usage from response.usage objects or summary dicts (langfuse
    _usage_and_cost shape). Always includes input/output even when zero."""
    if raw is None:
        return Usage(input_tokens=0, output_tokens=0)

    def get(obj: Any, key: str) -> Any:
        if isinstance(obj, dict):
            return obj.get(key)
        return getattr(obj, key, None)

    fields = {
        out: val
        for key, out in _USAGE_FIELDS
        if (val := get(raw, key)) is not None and val != 0 or out in ("input_tokens", "output_tokens")
    }
    return Usage(**{k: max(0, int(v or 0)) for k, v in fields.items()})


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


def _safe_str(value: Any) -> str | None:
    return None if value is None else str(value)


def _envelope(kwargs: dict[str, Any]) -> dict[str, Any]:
    """Common event fields: eventId, timestamp, turnId."""
    return {
        "event_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "turn_id": _safe_str(kwargs.get("turn_id")) or None,
    }


def register(ctx: Any) -> None:
    base_url = os.environ.get("HERMEUM_TELEMETRY_URL", DEFAULT_URL)
    telemetry = create_telemetry(base_url)
    telemetry.health_check()

    def on_session_start(**kwargs: Any) -> None:
        if kwargs.get("session_id"):
            telemetry.bind_session(str(kwargs["session_id"]))
        telemetry.record(
            SessionStartedEvent(
                **_envelope(kwargs),
                type="session_started",
                platform=_safe_str(kwargs.get("platform")) or "unknown",
                provider=_safe_str(kwargs.get("provider")) or "unknown",
                model=_safe_str(kwargs.get("model")) or "unknown",
                api_mode=_safe_str(kwargs.get("api_mode")) or "unknown",
            )
        )

    def post_llm_call(**kwargs: Any) -> None:
        if kwargs.get("session_id"):
            telemetry.bind_session(str(kwargs["session_id"]))
        raw_usage = kwargs.get("usage")
        if raw_usage is None:
            raw_usage = getattr(kwargs.get("response"), "usage", None)
        usage = _usage_from_any(raw_usage)
        # Cost is deliberately not computed here (no agent.usage_pricing
        # dependency); Hermeum estimates server-side. totalUsd: null = unknown.
        cost = Cost(total_usd=None)
        assistant = _assistant_from(kwargs.get("assistant_message"))
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
        duration = kwargs.get("api_duration")
        telemetry.record(
            LlmCallEvent(
                **_envelope(kwargs),
                type="llm_call",
                provider=_safe_str(kwargs.get("provider")) or "unknown",
                model=_safe_str(kwargs.get("response_model") or kwargs.get("model")) or "unknown",
                api_mode=_safe_str(kwargs.get("api_mode")) or "unknown",
                duration_s=round(float(duration), 3) if isinstance(duration, (int, float)) and duration > 0 else None,
                finish_reason=_safe_str(kwargs.get("finish_reason")) or None,
                usage=usage,
                cost=cost,
                assistant=assistant,
                moa_references=moa_references,
            )
        )

    def post_tool_call(**kwargs: Any) -> None:
        if kwargs.get("session_id"):
            telemetry.bind_session(str(kwargs["session_id"]))
        telemetry.record(
            ToolCallEvent(
                **_envelope(kwargs),
                type="tool_call",
                tool_name=_safe_str(kwargs.get("tool_name")) or "unknown",
                tool_call_id=_safe_str(kwargs.get("tool_call_id")) or str(uuid.uuid4()),
                args=_sanitize_value(kwargs.get("args")),
                result=_sanitize_value(kwargs.get("result")),
            )
        )

    def api_request_error(**kwargs: Any) -> None:
        if kwargs.get("session_id"):
            telemetry.bind_session(str(kwargs["session_id"]))
        error = kwargs.get("error")
        message = kwargs.get("reason") or _safe_str(error) or (str(type(error)) if error else "api_request_error")
        telemetry.record(
            ErrorEvent(
                **_envelope(kwargs),
                type="error",
                stage="llm",
                message=_sanitize(message if isinstance(message, str) else str(message))[:200],
                provider=_safe_str(kwargs.get("provider")) or None,
                model=_safe_str(kwargs.get("model")) or None,
            )
        )

    def on_session_finalize(**kwargs: Any) -> None:
        telemetry.record(
            SessionFinalizedEvent(
                **_envelope(kwargs),
                type="session_finalized",
                output=Assistant(content=None, tool_calls=[]),
            )
        )
        telemetry.flush()

    def on_subagent_start(**kwargs: Any) -> None:
        if kwargs.get("session_id"):
            telemetry.bind_session(str(kwargs["session_id"]))
        child_session_id = _safe_str(kwargs.get("child_session_id"))
        if not child_session_id:
            return
        telemetry.record(
            SubagentStartedEvent(
                event_id=str(uuid.uuid4()),
                type="subagent_started",
                timestamp=datetime.now(timezone.utc).isoformat(),
                turn_id=_safe_str(kwargs.get("turn_id")) or "",
                parent_turn_id=_safe_str(kwargs.get("parent_turn_id")) or None,
                child_session_id=child_session_id,
            )
        )

    def on_subagent_stop(**kwargs: Any) -> None:
        if kwargs.get("session_id"):
            telemetry.bind_session(str(kwargs["session_id"]))
        child_session_id = _safe_str(kwargs.get("child_session_id"))
        if not child_session_id:
            return
        telemetry.record(
            SubagentStoppedEvent(
                event_id=str(uuid.uuid4()),
                type="subagent_stopped",
                timestamp=datetime.now(timezone.utc).isoformat(),
                turn_id=_safe_str(kwargs.get("turn_id")) or "",
                parent_turn_id=_safe_str(kwargs.get("parent_turn_id")) or None,
                child_session_id=child_session_id,
            )
        )

    ctx.register_hook("on_session_start", on_session_start)
    ctx.register_hook("post_llm_call", post_llm_call)
    ctx.register_hook("post_tool_call", post_tool_call)
    ctx.register_hook("api_request_error", api_request_error)
    ctx.register_hook("on_session_finalize", on_session_finalize)
    ctx.register_hook("on_subagent_start", on_subagent_start)
    ctx.register_hook("on_subagent_stop", on_subagent_stop)

    log.info("[hermeum-telemetry] registered (url=%s)", base_url)