---
name: memory
category: reference
description: Persistent memory (`config.memory`) — the Hermeum memory provider, fixed by the platform.
---

# Persistent memory (`config.memory`)

Controls where the agent's persistent memory lives. Hermeum-managed agents
store memory in Hermeum through the `hermeum` memory provider, which mirrors
the native `memory` tool's `add` / `patch` / `remove` actions.

## Fields

- `provider` — memory provider. **Fixed to `hermeum`**: a different provider is rejected, and the platform injects it when the memory block is absent.

## Hermeum memory

The provider keeps entries on the Hermeum control plane instead of the agent's
disk, so operators can read and correct them even while the agent is down, and
they survive agent restarts.