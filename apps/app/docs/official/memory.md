---
name: memory
category: reference
description: Persistent memory (`config.memory`) — the Hermeum memory provider, fixed by the platform.
---

# Persistent memory (`config.memory`)

Controls where the agent's persistent memory lives. Hermeum-managed agents
receive operator-authored memory through the `hermeum` provider: entries are
curated from the agent's Memory page in Hermeum and injected as recalled
context each turn.

## Fields

- `provider` — memory provider. **Fixed to `hermeum`**: a different provider is rejected, and the platform injects it when the memory block is absent.

## Hermeum memory

Memory is **operator-authored and read-only to the agent**. The provider has no
tool: the agent cannot add, patch, or remove entries, so the store stays bounded
and the operator remains the source of truth. Entries live on the Hermeum
control plane instead of the agent's disk, so they can be edited while the agent
is down and they survive agent restarts.

Notes:

- Memory content is injected as recalled context each turn, so operator edits
  reach the agent on its next turn.
- The provider is additive upstream; the built-in `MEMORY.md` / `USER.md`
  stores remain governed by their own `memory_enabled` / `user_profile_enabled`
  flags.
- The provider needs no setup wizard: the ingest token and base URL are
  provisioned by Hermeum in the agent's environment (`HERMEUM_PLUGIN_TOKEN`,
  `HERMEUM_PLUGIN_BASE_URL`).
