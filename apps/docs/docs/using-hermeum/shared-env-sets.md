---
title: Shared env sets
description: Reuse environment variables across multiple agents.
sidebar_label: Shared env sets
sidebar_position: 6
displayed_sidebar: docsSidebar
---

# Shared env sets

A shared env set is a reusable collection of environment variables you can attach to
multiple agents. Instead of pasting the same `OPENAI_API_KEY` or `SLACK_BOT_TOKEN` into
every agent, you define it once in a shared env set and reference it from each agent that
needs it.

## Why use shared env sets

- **Avoid duplication** — define a secret once, reuse it across agents.
- **Rotate in one place** — update the value in the shared env set and every attached
  agent picks it up.
- **Keep secrets consistent** — no risk of one agent using an outdated key.

## Creating a shared env set

1. Open the **Shared env sets** page in Hermeum.
2. Select **New shared env set**.
3. Give it a name (for example, `shared-openai-key`) and an optional description.
4. Add the environment variables you want to share. Each variable has a name and a
   value — mark credentials as sensitive so they're stored securely.

## Attaching to agents

When creating or editing an agent, reference a shared env set from the agent's env
section. The variables in the set are merged with the agent's own env vars at runtime.

```yaml title="Example"
env:
  - name: LOG_LEVEL
    value: debug
sharedEnvSets:
  - envset-01H8X9F7...
```

In this example, `LOG_LEVEL` is specific to the agent, while everything in the
referenced shared env set (for instance, `OPENAI_API_KEY`) is pulled in from the set.

## Next steps

- [Creating an agent](../creating-an-agent) — the full agent model, including env.
- [Messaging platforms](../messaging-platforms) — platforms that commonly need shared
  credentials like bot tokens.