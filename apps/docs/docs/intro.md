---
sidebar_position: 1
slug: /
displayed_sidebar: docsSidebar
---

# What is Hermeum

Hermeum is a self-hostable web dashboard and Kubernetes control plane for creating,
configuring, and managing **Hermes AI agents**. Each agent you create in the dashboard
is reconciled into a running pod by the `hermes-agent-operator`, giving you
"Hermes-as-a-service" on your own cluster.

## Core concepts

{/* TODO */}

### Agent

An agent is the central object in Hermeum. It maps 1:1 to a `HermesAgent` Kubernetes
Custom Resource that the `hermes-agent-operator` reconciles into a running pod. An agent
carries:

- **Soul** — the primary identity, the first thing in the system prompt, defining who the
  agent is (personality and voice).
- **Config** — a full Hermes `config.yaml` (model, browser, web, platforms, image/video
  generation, and more).
- **Env** — up to 20 environment variables, including secrets.
- **Skills** — up to 20 skill identifiers (npm, GitHub, hubs, direct URLs).
- **Plugins** — up to 20 plugin identifiers.
- **Packages** — `pip` and `npm` packages to pre-install.
- **Crons** — up to 20 scheduled jobs.

### Lifecycle

When you create an agent, Hermeum writes a `HermesAgent` CR; the operator picks it up and
launches a pod running the Hermes agent container. Agent phases:

`Pending → Running → Succeeded | Failed | Suspended | Unknown`

You can archive, suspend, and resume agents, and request a gateway token to access an
agent's HTTP platforms.

### Control plane

Hermeum itself runs two listeners:

- **Port 3000 (HTTP)** — the dashboard UI, tRPC API, auth, and the AI config generator.
- **Port 8443 (HTTPS)** — a mutating admission webhook that patches `HermesAgent` CRs on
  CREATE/UPDATE.

## Where to go next

- **[Using Hermeum](./using-hermeum/getting-started)** — if you'll be creating and
  managing agents.
- **[Self-hosting](./operation/overview)** — if you're installing, configuring, or running
  the Hermeum service.