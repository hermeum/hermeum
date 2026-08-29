---
title: Instance config
description: The Hermeum config.yaml — templates and agent types.
sidebar_label: Instance config
sidebar_position: 4
displayed_sidebar: docsSidebar
---

# Instance config (`config.yaml`)

`config.yaml` is the instance-wide configuration file Hermeum loads at startup
(from `HERMEUM_CONFIG_PATH`). It defines the agent **templates** users can
start from and the **agent types** that drive the mutating admission webhook.
When the file is empty, Hermeum falls back to the image's bundled
`config.default.yaml`.

See [Installation](../installation) for how to mount a custom `config.yaml`
via the chart's `agentConfig` value.

## Overview

The file has two top-level keys: `templates` (required) and `agentTypes`
(optional).

```yaml
templates:
  - id: support-agent
    name: Support Agent
    description: Answers support questions using the docs and Notion knowledge base.
    agentInput:
      type: medium            # references an agentTypes key
      name: Support Agent
      soul: |-
        You are a helpful support agent grounded in the company's
        documentation and knowledge base. Answer clearly and practically,
        cite the source material when possible, and escalate when the
        answer is missing or uncertain.
      env:
        - name: NOTION_API_KEY
          value: <fill-me>     # users replace this when creating the agent
          sensitive: true
      skills:
        - skills/productivity/notion

agentTypes:
  medium:
    description: Medium resource profile — 2 CPU / 1Gi, limits 4 CPU / 2Gi.
    mutatingWebhookJsonPatch:
      - op: add
        path: /spec/hermes/resources
        value:
          requests: { cpu: "2", memory: 1Gi }
          limits:   { cpu: "4", memory: 2Gi }
```

A template's `agentInput.type` (when set) **must** reference a key in
`agentTypes` — Hermeum rejects the config at load time otherwise.

## Templates

A template is a starting point for a new agent. Each one has:

| Field         | Required | Description                                                        |
|---------------|----------|--------------------------------------------------------------------|
| `id`          | yes      | Stable identifier (used in API calls and logs).                    |
| `name`        | yes      | Human-readable name shown in the UI.                               |
| `description` | no       | One-line summary shown in the template picker.                     |
| `agentInput`  | yes      | A partial agent definition — see [Creating an agent](../../using-hermeum/creating-an-agent) for the full field list. |

`agentInput` carries the same shape as a `HermesAgent` CR: `name`,
`description`, `type`, `soul`, `config`, `env`, `skills`, `plugins`,
`packages`, `crons`, and `sharedEnvSets`. Anything you set here becomes the
default for agents created from the template; the user can override it in the
UI or via the AI config generator.

Env vars may use `<fill-me>` as a placeholder value — the config loads
successfully, and the user replaces it with a real value when creating the
agent (the strict check is enforced at agent creation, not at config load).

## Agent types

`agentTypes` is a map of type key → type definition. The type key is what an
agent's `type` field references. Each type has:

| Field                     | Required | Description                                                                  |
|---------------------------|----------|------------------------------------------------------------------------------|
| `description`             | no       | Human-readable description; surfaced to the AI config generator so it can pick the right type. |
| `mutatingWebhookJsonPatch`| yes      | A JSON-Patch ([RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902)) applied to the `HermesAgent` CR on `CREATE`/`UPDATE`. Accepts a flat `op` array (one candidate) or an array of arrays (multiple candidates; first match wins). |

When Hermeum receives an admission review, it looks up
`agentTypes[agent.type].mutatingWebhookJsonPatch` and returns it as the
patch. If multiple candidates are provided, Hermeum evaluates each
candidate's [`test`](https://datatracker.ietf.org/doc/html/rfc6902#section-4.6)
ops against the incoming object and returns the first one whose tests pass
(first-match-wins); no match means no patch (no-op). The webhook is a no-op
until at least one type has a non-empty patch. See
[Mutating webhook](../mutating-webhook) for the certificate options, the
end-to-end flow, and precondition examples.

:::note
Setting an agent's `type` requires `agentTypes` to be configured — Hermeum
rejects create/update calls with an unknown type.
:::

An agent can also expose an OpenAI-compatible
[API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
for other apps to call.