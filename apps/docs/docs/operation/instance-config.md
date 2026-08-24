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
`config.example.yaml`.

See [Installation](../installation) for how to mount a custom `config.yaml`
via the chart's `agentConfig` value.

## Overview

The file has two top-level keys: `templates` (required) and `agentTypes`
(optional). A template's `agentInput.type` (when set) **must** reference a key
in `agentTypes` — Hermeum rejects the config at load time otherwise.

## Templates

A template is a starting point for a new agent. Each one has an `id`, a
human-readable `name`, an optional `description`, and an `agentInput` — a
partial agent definition using the same shape as a `HermesAgent` CR (`name`,
`description`, `type`, `soul`, `config`, `env`, `skills`, `plugins`,
`packages`, `crons`, and `sharedEnvSets`). Anything you set in `agentInput`
becomes the default for agents created from the template; the user can override
it in the UI or via the AI config generator. See
[Creating an agent](../../using-hermeum/creating-an-agent) for the full field
list.

## Agent types

`agentTypes` is a map of type key → type definition. The type key is what an
agent's `type` field references. Each type has an optional `description`
(surfaced to the AI config generator so it can pick the right type) and a
required `mutatingWebhookJsonPatch` — a
[JSON-Patch (RFC 6902)](https://datatracker.ietf.org/doc/html/rfc6902) applied
to the `HermesAgent` CR on `CREATE`/`UPDATE`.

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