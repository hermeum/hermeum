"""Hermeum memory provider — injects operator-authored memory into the agent.

Entries live on the Hermeum control plane and are curated from the agent's
Memory page in Hermeum. The provider is read-only: ``prefetch()`` returns the
current entries as recalled context each turn, and the agent gets no memory
tool — it cannot grow or rewrite the store, so memory stays bounded and the
operator remains the source of truth.

Deliberate differences from hermes-agent's native memory tool:

- No tool surface at all. The native tool lets the model add/patch/remove
  entries; here only operators write (the Hermeum agent page).
- Memory is server-side, so operator edits reach the agent on its next turn and
  survive agent restarts.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any

_CLIENT_PARENT = Path(__file__).resolve().parent / "client"
sys.path.insert(0, str(_CLIENT_PARENT))

from openapi_client import ApiClient, Configuration  # noqa: E402
from openapi_client.api.agent_memory_api import AgentMemoryApi  # noqa: E402

from agent.memory_provider import MemoryProvider, RecallStatus  # noqa: E402
from agent.secret_scope import get_secret  # noqa: E402

log = logging.getLogger("hermeum.memory")

DEFAULT_URL = "http://hermeum:3000/plugin/trpc"
# Prefetch runs in front of every turn, so fail fast instead of retrying a dead
# server; the manager bounds external prefetch calls anyway.
REQUEST_TIMEOUT_S = 5.0


class HermeumMemoryProvider(MemoryProvider):
    """Operator-authored agent memory, injected as recalled context.

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

    def get_tool_schemas(self) -> list[dict[str, Any]]:
        """No agent-facing tool: memory is operator-authored, read-only to the agent."""
        return []

    def system_prompt_block(self) -> str:
        return (
            "# Hermeum Memory\n"
            "Active. Your memory is operator-managed: entries are curated in Hermeum and "
            "injected as recalled context. You have no Hermeum memory tool — the operator "
            "updates memory, not you."
        )

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Inject the current entries — the native frozen-snapshot analog.

        Entries are re-read each turn, so operator edits land on the next turn.
        """
        if not query or not query.strip():
            return ""
        try:
            entries = self._read()
        except Exception:
            log.warning("[hermeum-memory] prefetch failed", exc_info=True)
            return ""
        contents = [
            entry
            for entry in (str(item.get("content", "")) for item in entries)
            if entry.strip()
        ]
        if not contents:
            # Nothing injected: no recall indicator (a stale count would claim
            # the last prefetch brought entries when it did not).
            self._last_count = None
            return ""
        self._last_count = len(contents)
        body = "\n§\n".join(contents)
        return (
            "## Hermeum Memory\n"
            "MEMORY (operator-managed notes) — edited in Hermeum; treat as authoritative context.\n"
            f"{body}"
        )

    def recall_status(self) -> RecallStatus | None:
        if self._last_count is None:
            return None
        return RecallStatus(provider_label="Hermeum", count=self._last_count)

    def shutdown(self) -> None:
        self._api = None

    # -- internals ---------------------------------------------------------

    def _api_required(self) -> AgentMemoryApi:
        if self._api is None:
            raise RuntimeError("provider not initialized")
        return self._api

    def _read(self) -> list[dict[str, Any]]:
        response = self._api_required().agent_memory_read(_request_timeout=REQUEST_TIMEOUT_S)
        entries = response.result.data.entries  # type: ignore[union-attr]
        return [{"content": entry.content} for entry in entries]
