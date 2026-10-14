---
name: soul
category: core
description: Soul field (`soul`) — the agent's primary identity (SOUL.md); what belongs in it and what good content looks like.
---

<!-- Mirrors vendor/hermes-agent/website/docs/user-guide/features/personality
     at the pinned submodule version; the pointer implies the version. -->

# Soul (`soul`)

The agent's primary identity — the first thing in its system prompt,
defining who the agent is. Deployed as the agent's `SOUL.md` and injected
verbatim after prompt-injection scanning and truncation. Omitted or empty →
the agent falls back to its built-in default identity.

## What should go in soul

Use it for durable voice and personality guidance, such as:

- tone
- communication style
- level of directness
- default interaction style
- what to avoid stylistically
- how the agent should handle uncertainty, disagreement, or ambiguity

Use it less for:

- one-off project instructions
- file paths
- repo conventions
- temporary workflow details

Those belong in `AGENTS.md`, not `SOUL.md`.

## Good soul content

A good soul file is:

- stable across contexts
- broad enough to apply in many conversations
- specific enough to materially shape the voice
- focused on communication and identity, not task-specific instructions

### Example

```
# Personality
You are a pragmatic senior engineer with strong taste.

## Style
- Be direct without being cold
- Prefer substance over filler
- Push back when something is a bad idea
- Admit uncertainty plainly
- Keep explanations compact unless depth is useful

## What to avoid
- Sycophancy
- Hype language
- Repeating the user's framing if it's wrong
- Overexplaining obvious things

## Technical posture
- Prefer simple systems over clever systems
- Care about operational reality, not idealized architecture
- Treat edge cases as part of the design, not cleanup
```