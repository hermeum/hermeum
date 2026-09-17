---
title: Per-agent ingress and TLS
description: HERMEUM_AGENT_INGRESS_* and web + webhook TLS options.
sidebar_label: Ingress and TLS
sidebar_position: 8
displayed_sidebar: docsSidebar
---

# Per-agent ingress and TLS

Hermeum exposes three distinct TLS surfaces, each configured independently:

- **Per-agent ingress** — a `Ingress` per agent, routing
  external traffic to that agent's enabled HTTP platforms.
- **Web server TLS** — TLS for Hermeum's own HTTP listener (the UI,
  tRPC, auth, AI config generator).
- **Mutating webhook TLS** — TLS for the admission webhook's HTTPS listener.
  Covered in [Mutating webhook](../mutating-webhook); this page focuses on
  the first two.

## Per-agent ingress

When `HERMEUM_AGENT_INGRESS_BASE_HOSTNAME` is set, Hermeum emits an
`Ingress` per agent that routes each enabled HTTP platform on its own
**host**. By default the host is two levels below the base hostname
(multi-level DNS); setting `HERMEUM_AGENT_INGRESS_FLATTEN_HOSTS=true`
flattens it to a single level:

| Platform | Multi-level (default) | Flat (`HERMEUM_AGENT_INGRESS_FLATTEN_HOSTS=true`) |
| --- | --- | --- |
| api-server | `<agent-id>.api.<base hostname>` | `<agent-id>-api.<base hostname>` |
| webhook | `<agent-id>.hooks.<base hostname>` | `<agent-id>-hooks.<base hostname>` |
| teams | `<agent-id>.teams.<base hostname>` | `<agent-id>-teams.<base hostname>` |

Each host maps wholesale to the platform's Service port, so platforms can
never conflict on a shared path prefix. Platforms that are not enabled get
no host. When `HERMEUM_AGENT_INGRESS_BASE_HOSTNAME` is unset, **no
per-agent ingress is generated**.

| Variable | Default | Description |
| --- | --- | --- |
| `HERMEUM_AGENT_INGRESS_BASE_HOSTNAME` | — | Base hostname for per-agent ingresses; each HTTP platform is exposed at `<agent-id>.<platform-label>.<base>` (api / hooks / teams) — or `<agent-id>-<platform-label>.<base>` with `HERMEUM_AGENT_INGRESS_FLATTEN_HOSTS=true`. Unset = no ingress generated. |
| `HERMEUM_AGENT_INGRESS_FLATTEN_HOSTS` | `false` | Flatten agent ingress hosts to a single DNS level: `<agent-id>-<platform-label>.<base>` instead of `<agent-id>.<platform-label>.<base>`. One wildcard record/cert `*.<base>` then covers every agent and platform. |
| `HERMEUM_AGENT_INGRESS_SCHEME` | `http` | Public URL scheme advertised for agent ingresses. **Display-only** — it does not drive the emitted `tls` block; TLS is governed by `HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME`. |
| `HERMEUM_AGENT_INGRESS_CLASS_NAME` | — | Ingress controller class name set on generated ingresses (`spec.ingressClassName`). Omitted from the CR when unset. |
| `HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME` | — | TLS secret name for controller-terminated TLS. When set, the ingress emits a `tls` block with this secret covering every emitted platform host; when unset, no `tls` block is emitted (plain HTTP or load-balancer-terminated TLS). |

A typical setup with controller-terminated TLS:

```
HERMEUM_AGENT_INGRESS_BASE_HOSTNAME=agents.example.com
HERMEUM_AGENT_INGRESS_SCHEME=https
HERMEUM_AGENT_INGRESS_CLASS_NAME=nginx
HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME=agents-example-com-tls
```

This emits, for an agent `my-agent`, an Ingress whose hosts are
`my-agent.api.agents.example.com`, `my-agent.hooks.agents.example.com`, and
`my-agent.teams.agents.example.com` (per enabled platform), each with a
`tls` block referencing `agents-example-com-tls` (with
`HERMEUM_AGENT_INGRESS_FLATTEN_HOSTS=true`, the hosts become
`my-agent-api.…`, `my-agent-hooks.…`, `my-agent-teams.…`). The secret must
cover every emitted host — e.g. a wildcard cert per platform label
(`*.api.*`, `*.hooks.*`, `*.teams.*`) or a multi-SAN certificate; with
flattened hosts, a single `*.<base hostname>` wildcard suffices. You are
responsible for provisioning that Secret (e.g. via cert-manager, an
external secrets controller, or a manual creation).

:::note
`HERMEUM_AGENT_INGRESS_SCHEME` only affects the public URL Hermeum
advertises. It does **not** cause a `tls`
block to be emitted — that is controlled solely by
`HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME`.
:::

### DNS setup

The multi-level (default) pattern only works if the extra DNS level
resolves: every platform host is two levels below the base hostname, so a
wildcard record is required **per platform label** — a single
`*.<base hostname>` record does not cover the two-level
`<agent-id>.<platform-label>.<base>` hosts:

| Wildcard record | Example (base = `agents.example.com`) | Covers |
| --- | --- | --- |
| `*.api.<base hostname>` | `*.api.agents.example.com` | api-server hosts |
| `*.hooks.<base hostname>` | `*.hooks.agents.example.com` | webhook hosts |
| `*.teams.<base hostname>` | `*.teams.agents.example.com` | teams hosts |

Point each record (A/CNAME) at the same ingress load balancer that fronts
the Hermeum UI ingress. Only labels for platforms you actually enable need
records.

With `HERMEUM_AGENT_INGRESS_FLATTEN_HOSTS=true`, hosts are a single level
below the base hostname, so **one** wildcard record `*.<base hostname>`
(e.g. `*.agents.example.com`) covers every agent and platform.

## Web server TLS

Hermeum's own listener (UI, tRPC, auth, AI config generator) serves
HTTPS when both `HERMEUM_TLS_CERT_FILE` and `HERMEUM_TLS_KEY_FILE` are set;
otherwise it serves plain HTTP on `HERMEUM_PORT`.

| Variable | Default | Description |
| --- | --- | --- |
| `HERMEUM_PORT` | `3000` | Port the web server listens on (HTTP or HTTPS). |
| `HERMEUM_TLS_CERT_FILE` | — | Path to the web TLS cert (PEM). When set **with** `HERMEUM_TLS_KEY_FILE`, the web server serves HTTPS on `HERMEUM_PORT`. |
| `HERMEUM_TLS_KEY_FILE` | — | Path to the web TLS key (PEM). Pair with `HERMEUM_TLS_CERT_FILE`. |

This is an alternative to terminating TLS at an ingress gateway: with both
files set, TLS is terminated in-process by Node's `https` module. Probes
switch to `httpsGet` automatically when web TLS is enabled.

For most deployments, leave web TLS unset and terminate TLS at your ingress
controller instead — see [Installation](../installation) for the ingress
prerequisites. Use in-process web TLS when you don't run an ingress gateway
in front of Hermeum (e.g. a service-mesh sidecar or a load balancer
that forwards raw TLS).

## Webhook TLS

The mutating webhook is served on a separate HTTPS port and configured by a
different set of env vars. See [Mutating webhook](../mutating-webhook) for
the full flow and certificate options.