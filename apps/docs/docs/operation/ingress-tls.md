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
- **Web server TLS** — TLS for the dashboard's own HTTP listener (the UI,
  tRPC, auth, AI config generator).
- **Mutating webhook TLS** — TLS for the admission webhook's HTTPS listener.
  Covered in [Mutating webhook](../mutating-webhook); this page focuses on
  the first two.

## Per-agent ingress

When `HERMEUM_AGENT_INGRESS_BASE_HOSTNAME` is set, the dashboard emits an
`Ingress` per agent at `<agent-id>.<base hostname>`.

When `HERMEUM_AGENT_INGRESS_BASE_HOSTNAME` is unset, **no per-agent ingress
is generated**.

| Variable | Default | Description |
| --- | --- | --- |
| `HERMEUM_AGENT_INGRESS_BASE_HOSTNAME` | — | Base hostname for per-agent ingresses (`<agent-id>.<base>`). Unset = no ingress generated. |
| `HERMEUM_AGENT_INGRESS_SCHEME` | `http` | Public URL scheme advertised for agent ingresses. **Display-only** — it does not drive the emitted `tls` block; TLS is governed by `HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME`. |
| `HERMEUM_AGENT_INGRESS_CLASS_NAME` | — | Ingress controller class name set on generated ingresses (`spec.ingressClassName`). Omitted from the CR when unset. |
| `HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME` | — | TLS secret name for controller-terminated TLS. When set, the ingress emits a `tls` block with this secret; when unset, no `tls` block is emitted (plain HTTP or load-balancer-terminated TLS). |

A typical setup with controller-terminated TLS:

```
HERMEUM_AGENT_INGRESS_BASE_HOSTNAME=agents.example.com
HERMEUM_AGENT_INGRESS_SCHEME=https
HERMEUM_AGENT_INGRESS_CLASS_NAME=nginx
HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME=agents-example-com-tls
```

This emits, for an agent `my-agent`, an Ingress for
`my-agent.agents.example.com` with a `tls` block referencing
`agents-example-com-tls`. You are responsible for provisioning that Secret
(e.g. via cert-manager, an external secrets controller, or a manual creation).

:::note
`HERMEUM_AGENT_INGRESS_SCHEME` only affects the public URL Hermeum
advertises. It does **not** cause a `tls`
block to be emitted — that is controlled solely by
`HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME`.
:::

## Web server TLS

The dashboard's own listener (UI, tRPC, auth, AI config generator) serves
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
in front of the dashboard (e.g. a service-mesh sidecar or a load balancer
that forwards raw TLS).

## Webhook TLS

The mutating webhook is served on a separate HTTPS port and configured by a
different set of env vars. See [Mutating webhook](../mutating-webhook) for
the full flow and certificate options.