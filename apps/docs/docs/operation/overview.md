---
title: Overview
description: Hermeum architecture — the Hermeum server, the operator, and the HermesAgent CRD.
sidebar_label: Overview
sidebar_position: 1
displayed_sidebar: docsSidebar
---

# Overview

This section is for operators and administrators who want to install, run, and
maintain Hermeum for their own organization. For the end-user perspective
(creating agents, chatting, connecting platforms), see
[Using Hermeum](../../using-hermeum/getting-started).

## What Hermeum is

Hermeum is a self-hostable control plane for **tailored Hermes agents** on
Kubernetes. You describe an agent in natural language; Hermeum turns that
description into a `HermesAgent` custom resource, and the
`hermes-agent-operator` reconciles each CR into a running Hermes agent pod —
with its model config, skills, env vars, and messaging-platform endpoints wired
in. Nothing about your agents leaves your cluster.

## Architecture

Hermeum has three moving parts: the **Hermeum server**, the **operator**, and
the **`HermesAgent` custom resource**.

```
You ──► Hermeum (:3000) ──► HermesAgent CR ──► Operator ──► Agent pods
              ▲                                  │
kube-apiserver ──► :8443 mutating webhook ───────┘ (JSON-Patch)
```

### Hermeum

The control plane. A Node/Express server hosting the web UI, tRPC API, Better
Auth, and an AI config generator that turns a natural-language description into
an agent configuration corresponding to a `HermesAgent` CR. Hermeum reconciles
each agent into a `HermesAgent` CR and writes the per-agent ConfigMaps and
Secrets the operator consumes.

### Operator

The reconciler. It installs the `HermesAgent` CRD and turns each CR into a
running Hermes agent StatefulSet. It ships as an OCI Helm chart dependency
that Hermeum's chart installs by default — set `operator.enabled=false` if
you've already installed it cluster-wide. See
[hermes-agent-operator on GitHub](https://github.com/hermeum/hermes-agent-operator).

### Custom resource

The source of truth for one agent. `HermesAgent`
(`agents.hermeum.app/v1alpha1`) is reconciled by the operator into a running
Hermes agent. A mutating admission webhook applies
`agentTypes.<type>.mutatingWebhookJsonPatch` on `CREATE`/`UPDATE`.

## Next steps

- [Installation](../installation)
- [Configuration reference](../configuration-reference)