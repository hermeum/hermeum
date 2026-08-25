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
templates:        # required — list of templates users can start from
  - id: minimal
    name: Minimal
    description: Create an agent with minimal configuration.
    agentInput:
      config:
        model:
          base_url: https://ollama.com/v1
          default: kimi-k2.6
          provider: ollama-cloud

agentTypes:        # optional — map of type key → { description?, mutatingWebhookJsonPatch }
  my-type:
    description: Injects an annotation marking the agent type.
    mutatingWebhookJsonPatch:
      - op: add
        path: /metadata/annotations/hermeum.app~1type
        value: my-type
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

## Agent types

`agentTypes` is a map of type key → type definition. The type key is what an
agent's `type` field references. Each type has:

| Field                     | Required | Description                                                                  |
|---------------------------|----------|------------------------------------------------------------------------------|
| `description`             | no       | Human-readable description; surfaced to the AI config generator so it can pick the right type. |
| `mutatingWebhookJsonPatch`| yes      | A JSON-Patch ([RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902)) applied to the `HermesAgent` CR on `CREATE`/`UPDATE`. |

When Hermeum receives an admission review, it looks up
`agentTypes[agent.type].mutatingWebhookJsonPatch` and returns it as the
patch. The webhook is a no-op until at least one type has a non-empty patch.
See [Mutating webhook](../mutating-webhook) for the certificate options and
the end-to-end flow.

:::note
Setting an agent's `type` requires `agentTypes` to be configured — Hermeum
rejects create/update calls with an unknown type.
:::

An agent can also expose an OpenAI-compatible
[API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
for other apps to call.