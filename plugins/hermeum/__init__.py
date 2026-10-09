"""Hermeum plugin.

Forwards hermes agent-session events to Hermeum's plugin-protocol endpoint
(POST /plugin/trpc/agentSession.agentSessionEvents), constructing the typed
event payloads defined by Hermeum's schema (entities/telemetry.ts — see the
event union's `oneOf` in openapi/plugin.json). Field extraction mirrors the
bundled langfuse observability plugin. All event-building business logic
lives in `telemetry.py` (HermeumTelemetry); this module only registers hooks.

Following the hermes observer contract
(docs/developer-guide/observer-hooks) — post-only events, LLM spans from the
request-scoped hook:

- pre_api_request    -> context stash only: the turn's user_message (the
                        post-api hook carries no request side) kept for the
                        next llm_call of the same turn; emits no event
- on_session_start  -> session_started (platform/provider/model/apiMode)
- post_api_request  -> llm_call (userMessage, usage, assistant, durationS,
                        finishReason, response_model; also carries sanitized
                        request/response)
- post_tool_call    -> tool_call (toolName, toolCallId, args, result,
                       durationS from duration_ms, status)
- api_request_error -> error (stage llm, message from error/reason)
- on_session_finalize -> session_finalized (last assistant output) + flush
- subagent_start    -> subagent_started (turnId, parentTurnId, childSessionId)
- subagent_stop     -> subagent_stopped

Pre-call *events* are deliberately not emitted — every event is a completed
record; the pre_api_request hook is registered only to stash turn context.
Content is captured in a "sanitized" mode (langfuse default): secret
redaction before truncation, so a secret straddling the cut cannot leak.
Cost is not computed here (totalUsd: null) — Hermeum estimates server-side.
"""

from __future__ import annotations

import os
from typing import Any

from .telemetry import create_telemetry

log = __import__("logging").getLogger("hermeum.plugin")

DEFAULT_URL = "http://localhost:3000/plugin/trpc"


def register(ctx: Any) -> None:
    base_url = os.environ.get("HERMEUM_PLUGIN_BASE_URL", DEFAULT_URL)
    telemetry = create_telemetry(base_url)
    telemetry.health_check()

    ctx.register_hook("pre_api_request", telemetry.pre_api_request)
    ctx.register_hook("on_session_start", telemetry.session_started)
    ctx.register_hook("post_api_request", telemetry.llm_call)
    ctx.register_hook("post_tool_call", telemetry.tool_call)
    ctx.register_hook("api_request_error", telemetry.api_error)
    ctx.register_hook("on_session_finalize", telemetry.session_finalized)
    ctx.register_hook("subagent_start", telemetry.subagent_started)
    ctx.register_hook("subagent_stop", telemetry.subagent_stopped)

    log.info("[hermeum-telemetry] registered (url=%s)", base_url)