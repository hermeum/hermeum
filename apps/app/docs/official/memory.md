---
name: memory
category: reference
description: Persistent memory (`config.memory`) — the Hermeum memory provider and the fixed built-in store flags.
---

# Persistent memory (`config.memory`)

Controls where the agent's persistent memory lives. Hermeum-managed agents
store memory in Hermeum through the `hermeum` memory provider, which mirrors
the native `memory` tool's `add` / `patch` / `remove` actions.

## Fields

- `provider` — memory provider. **Fixed to `hermeum`**: a different provider is rejected, and the platform injects it when the memory block is absent.
- `memory_enabled` — **Fixed to `false`**: the platform disables the built-in `MEMORY.md` store and its `memory` tool. An external provider runs alongside the built-in stores upstream, so this flag completes the replacement.
- `user_profile_enabled` — **Fixed to `false`**: there is no built-in `USER.md` user profile.

## Hermeum memory

The platform pins the whole policy (`provider: hermeum`, both built-in store
flags `false`) and injects it automatically; it does not need to be set by
hand. The provider keeps entries on the Hermeum control plane instead of the
agent's disk, so operators can read and correct them even while the agent is
down, and they survive agent restarts.

Notes:

- The provider's tool (`hermeum_memory`) is exposed only when the `memory`
  toolset is enabled (default toolsets include it; per-route webhook toolsets
  must list it).
- Memory content is injected as recalled context each turn, so operator edits
  reach the agent on its next turn.
