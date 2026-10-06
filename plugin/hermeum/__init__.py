"""Hermeum telemetry plugin.

Forwards hermes agent-session events to Hermeum's plugin-protocol endpoint
(POST /plugin/trpc/agentSession.agentSessionEvents), mirroring the event
surface of the bundled langfuse observability plugin:

- on_session_start    -> session_started
- pre_llm_call        -> message (user/turn context)
- post_llm_call       -> llm_call (usage, duration)
- pre_tool_call       -> tool_call (requested)
- post_tool_call      -> tool_call (completed)
- api_request_error   -> error
- on_session_finalize -> flush remaining buffered events
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from .telemetry import HermeumTelemetry, create_telemetry

log = logging.getLogger("hermeum.plugin")

DEFAULT_URL = "http://localhost:3000/plugin/trpc"


def register(ctx: Any) -> None:
    base_url = os.environ.get("HERMEUM_TELEMETRY_URL", DEFAULT_URL)
    telemetry = create_telemetry(base_url)
    telemetry.health_check()

    def on_session_start(**kwargs: Any) -> None:
        telemetry.record("session_started", **_safe(kwargs))

    def pre_llm_call(**kwargs: Any) -> None:
        telemetry.record("message", **_safe(kwargs))

    def post_llm_call(**kwargs: Any) -> None:
        telemetry.record("llm_call", **_safe(kwargs))

    def pre_tool_call(**kwargs: Any) -> None:
        telemetry.record("tool_call", {"phase": "pre"}, **_safe(kwargs))

    def post_tool_call(**kwargs: Any) -> None:
        telemetry.record("tool_call", {"phase": "post"}, **_safe(kwargs))

    def api_request_error(**kwargs: Any) -> None:
        telemetry.record("error", **_safe(kwargs))

    def on_session_finalize(**kwargs: Any) -> None:
        telemetry.flush()

    ctx.register_hook("on_session_start", on_session_start)
    ctx.register_hook("pre_llm_call", pre_llm_call)
    ctx.register_hook("post_llm_call", post_llm_call)
    ctx.register_hook("pre_tool_call", pre_tool_call)
    ctx.register_hook("post_tool_call", post_tool_call)
    ctx.register_hook("api_request_error", api_request_error)
    ctx.register_hook("on_session_finalize", on_session_finalize)

    log.info("[hermeum-telemetry] registered (url=%s)", base_url)


def _safe(kwargs: dict[str, Any]) -> dict[str, Any]:
    cleaned = {k: v for k, v in (kwargs or {}).items() if not k.startswith("_")}
    return {"kwargs": json.loads(json.dumps(cleaned, default=repr))}