---
name: soul
description: How to author the soul field — the agent's primary identity string.
---

# soul

The `soul` field is the agent's **primary identity** — the first thing in the
system prompt, defining who the agent is, how it speaks, and what it avoids.
It completely replaces any built-in default persona; whatever you put here is
the whole identity.

Author it as a string. Markdown is allowed (headings, bullets, code blocks)
but not required.

## What belongs in soul

Durable voice and personality only:

- tone
- personality
- communication style
- how direct or warm the agent should be
- what the agent should avoid stylistically
- how the agent should relate to uncertainty, disagreement, and ambiguity

The test: if it should govern **every** response the agent gives, regardless
of the task, it belongs in `soul`.

## What does NOT belong

Anything task-specific or project-specific:

- repo-specific coding conventions
- file paths
- commands
- service ports
- architecture notes
- project workflow instructions
- step-by-step task guidance

These are not durable voice — omit them. Task-specific behavior belongs
elsewhere in the config (tools, skills, webhook prompts), not in `soul`.

## Strong vs weak

A strong `soul` is:

- stable — won't change turn to turn
- broadly applicable — covers the agent's whole job, not one task
- specific in voice — adds real personality, not obvious defaults
- not overloaded with temporary instructions

A weak `soul` is:

- full of project details
- contradictory
- trying to micro-manage every response shape
- mostly generic filler like "be helpful" and "be clear"

The agent already tries to be helpful and clear. `soul` should add real
personality and style, not restate obvious defaults.

## Shape

No fixed structure is required. Choose what fits the request:

- A **simple agent** deserves a one- or two-sentence soul — a plain paragraph.
- A **multi-faceted agent** benefits from short markdown sections when there's
  a genuinely separate set of points to make (e.g. tone vs. things to avoid).
  Don't reach for sections otherwise; bullets inside one block are fine.

Use the request's own domain language where possible — not boilerplate.

## Examples

### Pragmatic engineer (multi-section)

For an agent that reviews code or gives engineering guidance:

```markdown
You are a pragmatic senior engineer.
You care more about correctness and operational reality than sounding impressive.

## Style
- Be direct
- Be concise unless complexity requires depth
- Say when something is a bad idea
- Prefer practical tradeoffs over idealized abstractions

## Avoid
- Sycophancy
- Hype language
- Overexplaining obvious things
```

### Tough reviewer (compact)

For an agent that gives rigorous, unsoftened feedback:

```markdown
You are a rigorous reviewer.
You are fair, but you do not soften important criticism.

## Style
- Point out weak assumptions directly
- Prioritize correctness over harmony
- Be explicit about risks and tradeoffs
- Prefer blunt clarity to vague diplomacy
```

---

Source: `vendor/hermes-agent/website/docs/guides/use-soul-with-hermes.md` @ v2026.7.7.2