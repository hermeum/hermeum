"""Hermeum memory provider — MemoryProvider backed by Hermeum's agent memory.

Mirrors hermes-agent's native memory tool (tools/memory_tool.py and
tools/memory_tool_store.py): one tool with add / patch / remove actions, an
atomic `operations` batch, short unique substring matching, and the same JSON
result payloads. What changes is where memory lives: entries are stored on the
Hermeum control plane (plugin protocol agentMemory.*), so operators can see and
correct them even while the agent is down, and they survive agent restarts.

Hermeum's server exposes two procedures: `agentMemory.batch` carries every
write (the advertised tool shape is the `operations` batch) and
`agentMemory.read` feeds prefetch. A drifted top-level single-op tool call is
translated into a one-op batch here, keeping the server to one mutation path.

Deliberate differences from the native tool:

- `target` is always "memory": Hermeum keeps one store per agent and does not
  manage USER.md (the native tool's user-profile target).
- No character budget in the PoC (the native 2,200/1,375 limits and the
  consolidation/overflow paths do not apply yet).
- No write-approval staging or background-review gate — writes are direct
  server writes; operators edit the same store.

Generated client: plugins/hermeum/client is built from openapi/plugin.json.
Responses are read as raw JSON (`*_without_preload_content`) because the
generator mis-emits the zod `literal(true)`/`literal(false)` discriminators as
string enums, which makes the generated oneOf models reject every valid
payload. The request models are used as-is.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any, Callable

_CLIENT_PARENT = Path(__file__).resolve().parent / "client"
sys.path.insert(0, str(_CLIENT_PARENT))

from openapi_client import ApiClient, Configuration  # noqa: E402
from openapi_client.api.agent_memory_api import AgentMemoryApi  # noqa: E402
from openapi_client.models.agent_memory_batch_request import AgentMemoryBatchRequest  # noqa: E402
from openapi_client.models.agent_memory_batch_request_operations_inner import (  # noqa: E402
    AgentMemoryBatchRequestOperationsInner,
)

from agent.memory_provider import MemoryProvider, RecallStatus  # noqa: E402
from agent.secret_scope import get_secret  # noqa: E402

log = logging.getLogger("hermeum.memory")

DEFAULT_URL = "http://hermeum:3000/plugin/trpc"
# Tool calls block the turn, so fail fast instead of retrying a dead server.
REQUEST_TIMEOUT_S = 5.0

# Native tool messages kept verbatim so replayed transcripts get the same
# actionable guidance.
_PATCH_DROP_HINT = (
    "To drop text inside an entry, patch a longer span that contains it; "
    "'remove' deletes the whole entry."
)
_REPLACE_REMOVED = (
    "'replace' is not available; use 'patch'. old_text is the exact span to change and "
    "content is its new text; the rest of the entry is kept. To rewrite a whole entry, "
    "set old_text to the whole entry. Nothing was written."
)

# Server payloads are camelCase (Hermeum's protocol); the model sees the native
# tool's snake_case keys.
_CAMEL_TO_NATIVE = {
    "entryCount": "entry_count",
    "currentEntries": "current_entries",
    "closestEntries": "closest_entries",
}

MEMORY_SCHEMA = {
    "name": "hermeum_memory",
    "description": (
        "Save durable facts to the agent's Hermeum-managed memory that survive across "
        "sessions and agent restarts. Memory is injected into every future turn, so keep "
        "entries compact and high-signal. Operators can see and correct these entries in "
        "Hermeum — they live on the server, not on the agent's disk.\n\n"
        "HOW: make ALL your changes in ONE call via an 'operations' array (each item: "
        "{action, content?, old_text?}). The batch applies atomically, so a single call can "
        "patch or remove stale entries AND add new ones; one batch call finishes the update, "
        "so don't repeat it.\n\n"
        "WHEN: only for facts that apply to EVERY session regardless of task: stable "
        "environment facts, standing conventions with no task home. Anything learned while "
        "doing a task (procedures, pitfalls, task-specific preferences) belongs in the task's "
        "skill via skill_manage.\n\n"
        "TARGET: only 'memory' — your notes (environment, conventions, tool quirks, lessons). "
        "There is no user-profile store.\n\n"
        "SKIP: trivial/obvious info, easily re-discovered facts, raw data dumps, task progress, "
        "completed-work logs, temporary TODO state (use session_search for those)."
    ),
    # Mirrors the native schema: one target plus an operations batch. The
    # handler also accepts the legacy top-level single-op shape
    # (action/content/old_text) because models drift and transcripts replay it.
    "parameters": {
        "type": "object",
        "properties": {
            "target": {
                "type": "string",
                "enum": ["memory"],
                "description": "The enabled store: 'memory' for personal notes.",
            },
            "operations": {
                "type": "array",
                "description": (
                    "Changes applied atomically in one call; a single change is a one-item list."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["add", "patch", "remove"]},
                        "content": {
                            "type": "string",
                            "description": (
                                "Required for 'add' and 'patch'. For 'add', the new entry. For "
                                "'patch', the text that replaces old_text; the rest of the "
                                "entry is kept."
                            ),
                        },
                        "old_text": {
                            "type": "string",
                            "description": (
                                "REQUIRED for 'patch' and 'remove': text from one entry. 'patch' "
                                "replaces exactly this span (it must occur once in the entry); "
                                "'remove' deletes the whole entry. Omit for 'add'."
                            ),
                        },
                    },
                    "required": ["action"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["target", "operations"],
    },
}


def _failure(message: str) -> str:
    """Native memory-tool error shape."""
    return json.dumps({"success": False, "error": message}, ensure_ascii=False)


def _native_payload(payload: dict[str, Any]) -> str:
    """Render a server result payload with the native tool's snake_case keys."""
    native = {_CAMEL_TO_NATIVE.get(key, key): value for key, value in payload.items()}
    return json.dumps(native, ensure_ascii=False)


class HermeumMemoryProvider(MemoryProvider):
    """Agent memory stored on the Hermeum control plane.

    One instance per agent/session (the memory manager constructs a fresh one
    per load); the ingest token baked into the agent env identifies the agent,
    so the server scopes entries without the provider passing an id.
    """

    def __init__(self, base_url: str = DEFAULT_URL, token: str | None = None) -> None:
        self._base_url = base_url
        self._token = token or ""
        self._api: AgentMemoryApi | None = None
        self._session_id = ""
        self._last_count: int | None = None

    @property
    def name(self) -> str:
        return "hermeum"

    def is_available(self) -> bool:
        """Configured? The ingest token ships in the agent's env. No network calls."""
        return bool(get_secret("HERMEUM_PLUGIN_TOKEN"))

    def initialize(self, session_id: str, **kwargs) -> None:
        # Bind from the scoped secrets (multiplexing-safe), never module state:
        # one gateway process may serve several profiles, each with its own env.
        self._session_id = session_id
        self._base_url = get_secret("HERMEUM_PLUGIN_BASE_URL", DEFAULT_URL) or DEFAULT_URL
        self._token = get_secret("HERMEUM_PLUGIN_TOKEN", "") or ""
        configuration = Configuration(host=self._base_url, retries=0)
        api_client = ApiClient(configuration)
        if self._token:
            # Bearer auth rides as a default header (merged into every request);
            # the generated client declares no security scheme. The server is
            # fail-closed: a request without a valid token is rejected with 401.
            api_client.default_headers["Authorization"] = f"Bearer {self._token}"
        self._api = AgentMemoryApi(api_client)
        log.info("[hermeum-memory] initialized (url=%s, session=%s)", self._base_url, session_id)

    def get_config_schema(self) -> list[dict[str, Any]]:
        """No setup-wizard fields: the token and base URL are provisioned by Hermeum."""
        return []

    def system_prompt_block(self) -> str:
        return (
            "# Hermeum Memory\n"
            "Active. Your memory is stored server-side in Hermeum (operator-visible, survives "
            "agent restarts). Recalled entries arrive as context; use hermeum_memory to add, "
            "patch, or remove entries."
        )

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Inject the current entries — the native frozen-snapshot analog.

        The native tool renders MEMORY.md into the system prompt at session
        start; Hermeum memory is server-side, so the snapshot is re-read each
        turn. That also means operator edits land on the next turn.
        """
        if not query or not query.strip():
            return ""
        try:
            payload = self._read()
        except Exception:
            log.warning("[hermeum-memory] prefetch failed", exc_info=True)
            return ""
        entries = [
            str(entry.get("content", ""))
            for entry in payload.get("entries", [])
            if str(entry.get("content", "")).strip()
        ]
        if not entries:
            # Nothing injected: no recall indicator (a stale count would claim
            # the last prefetch brought entries when it did not).
            self._last_count = None
            return ""
        self._last_count = len(entries)
        body = "\n§\n".join(entries)
        return (
            "## Hermeum Memory\n"
            "MEMORY (your personal notes) — Hermeum-managed; operators may edit these entries.\n"
            f"{body}"
        )

    def recall_status(self) -> RecallStatus | None:
        if self._last_count is None:
            return None
        return RecallStatus(provider_label="Hermeum", count=self._last_count)

    def get_tool_schemas(self) -> list[dict[str, Any]]:
        return [MEMORY_SCHEMA]

    def handle_tool_call(self, tool_name: str, args: dict, **kwargs) -> str:
        if tool_name != MEMORY_SCHEMA["name"]:
            return _failure(f"Unknown memory tool: {tool_name}")
        target = args.get("target") or "memory"
        if target != "memory":
            return _failure(f"Invalid memory target '{target}'. Use 'memory'.")
        try:
            operations = args.get("operations")
            if operations:
                return self._run_operations(operations)
            action = args.get("action") or ""
            if action == "replace":
                return _failure(_REPLACE_REMOVED)
            if action not in ("add", "patch", "remove"):
                return _failure(f"Unknown action '{action or 'None'}'. Use: add, patch, remove")
            # Legacy top-level single-op shape (unadvertised; tolerated for
            # drifted calls) — translate it into a one-op batch so the server
            # keeps one mutation path. Native aliases new_text to content.
            content = args.get("content")
            if content is None:
                content = args.get("new_text")
            return self._run_operations(
                [{"action": action, "content": content, "old_text": args.get("old_text")}]
            )
        except Exception as exc:
            log.warning("[hermeum-memory] %s failed", tool_name, exc_info=True)
            return _failure(f"Hermeum memory is unavailable: {exc}")

    def shutdown(self) -> None:
        self._api = None

    # -- internals ---------------------------------------------------------

    def _api_required(self) -> AgentMemoryApi:
        if self._api is None:
            raise RuntimeError("provider not initialized")
        return self._api

    def _run_operations(self, operations: Any) -> str:
        if not isinstance(operations, list):
            return _failure("operations must be a list of {action, content?, old_text?} objects.")
        built: list[AgentMemoryBatchRequestOperationsInner] = []
        for index, raw in enumerate(operations):
            operation = raw if isinstance(raw, dict) else {}
            action = str(operation.get("action") or "")
            if action == "replace":
                return _failure(_REPLACE_REMOVED)
            if action not in ("add", "patch", "remove"):
                return _failure(
                    f"Operation {index + 1} ({action or 'unknown'}): unknown action. "
                    "Use add, patch, or remove."
                )
            content = operation.get("content")
            if content is None:
                content = operation.get("new_text")
            built.append(
                AgentMemoryBatchRequestOperationsInner(
                    action=action,
                    content=content,
                    old_text=operation.get("old_text"),
                )
            )
        return _native_payload(
            self._call(self._api_required().agent_memory_batch_without_preload_content,
                       AgentMemoryBatchRequest(operations=built))
        )

    def _read(self) -> dict[str, Any]:
        return self._call(self._api_required().agent_memory_read_without_preload_content, None)

    def _call(self, call: Callable[..., Any], request: Any) -> dict[str, Any]:
        """One plugin-protocol call; return the trpc `result.data` payload."""
        if request is None:
            response = call(_request_timeout=REQUEST_TIMEOUT_S)
        else:
            response = call(request, _request_timeout=REQUEST_TIMEOUT_S)
        if response.status >= 400:
            raise RuntimeError(f"HTTP {response.status}")
        body = json.loads(response.data.decode("utf-8"))
        return body["result"]["data"]
