---
title: Configuration reference
description: Every HERMEUM_* environment variable.
sidebar_label: Configuration reference
sidebar_position: 3
displayed_sidebar: docsSidebar
---

# Configuration reference

Hermeum is configured entirely through `HERMEUM_*` environment variables. The
Hermeum reads them once at startup via a Zod schema
(`apps/app/src/server/libs/config.ts`); invalid or missing required
values fail fast with a parse error before the server binds a port.

The Helm chart maps these to `secrets.*` (sensitive) and `config.*`
(non-sensitive) values — see [Installation](../installation). Every variable
below is optional unless marked **required**.

## Environment variables

Required variables must be set or the Hermeum pod refuses to start. All
others fall back to the defaults listed here.

### Core

| Variable | Default | Description |
| --- | --- | --- |
| `HERMEUM_DATABASE_URL` | — | Connection URL for the Hermeum database. For sqlite use `file:/path/to/db.sqlite`; for postgres use a `postgres://` URL. See [Database](../database). |
| `HERMEUM_DATABASE_DIALECT` | `sqlite` | Database backend dialect. One of `sqlite`, `postgres`. Must match the scheme of `HERMEUM_DATABASE_URL`. |
| `HERMEUM_KUBERNETES_NAMESPACE` | `hermeum` | Kubernetes namespace where `HermesAgent` custom resources are reconciled. Hermeum must have RBAC to read/write this namespace. |
| `HERMEUM_CONFIG_PATH` | `./config.yaml` | Path to the Hermeum instance config file. See [Instance config](../instance-config) for the schema. |
| `HERMEUM_HERMES_DOCS_PATH` | `./docs/hermes-config` | Path to the hermes-config docs directory used by the docs file adaptor. |
| `HERMEUM_LOG_LEVEL` | `info` | Log verbosity. One of `debug`, `info`, `warn`, `error`. |

### Agent image

The container image emitted into every `HermesAgent` CR's `spec.image`.

| Variable | Default | Description |
| --- | --- | --- |
| `HERMEUM_HERMES_IMAGE_REPOSITORY` | `nousresearch/hermes-agent` | Container image repository for the Hermes agent. Omit the registry host for Docker Hub, or include it (e.g. `ghcr.io/hermeum/hermes-agent`) for other registries. |
| `HERMEUM_HERMES_IMAGE_TAG` | `v2026.7.7.2` | Container image tag for the Hermes agent. Pin to a specific release for reproducible agent pods. |

### Auth

Better Auth email/password, allowed email domains, and outgoing SMTP. Better
Auth's own secret (`BETTER_AUTH_SECRET`) is provided via Helm `secrets.*` and
is not a `HERMEUM_*` variable.

| Variable | Default | Description |
| --- | --- | --- |
| `HERMEUM_SMTP_URL` | — | SMTP server URL for outgoing email (e.g. `smtps://user:pass@smtp.example.com:465`). Optional. |
| `HERMEUM_ALLOWED_EMAIL_DOMAIN` | — | Restrict sign-ups to this email domain (e.g. `example.com`). Optional; when unset, any domain is accepted. |

### AI config generator

The AI config generator uses an OpenAI-compatible chat completion endpoint to
draft agent `config.yaml` blocks from natural-language prompts.

| Variable | Default | Description |
| --- | --- | --- |
| `HERMEUM_OPENAI_MODEL` | `gpt-5.5` | Model id passed to the completion call. Must be a model the configured endpoint serves. |
| `HERMEUM_OPENAI_BASE_URL` | — | Override the OpenAI API base URL. Point this at any OpenAI-compatible gateway (vLLM, Ollama, Azure OpenAI, etc.). When unset, the OpenAI default is used. |
| `HERMEUM_OPENAI_API_KEY` | — | API key for the OpenAI-compatible endpoint. Required when targeting the hosted OpenAI API; may be unused for local gateways. |

### Per-agent ingress

When `HERMEUM_AGENT_INGRESS_BASE_HOSTNAME` is set, Hermeum emits an
`Ingress` per agent at `<agent-id>.<base hostname>`, routing to the agent's
enabled HTTP platforms (api-server `/v1`, `/api`; webhook `/webhooks`; teams
`/api/messages`). When it is unset, **no ingress is generated**.

| Variable | Default | Description |
| --- | --- | --- |
| `HERMEUM_AGENT_INGRESS_BASE_HOSTNAME` | — | Base hostname for per-agent ingresses (`<agent-id>.<base>`). Unset = no ingress generated. |
| `HERMEUM_AGENT_INGRESS_SCHEME` | `http` | Public URL scheme advertised for agent ingresses. **Display-only** — it does not drive the emitted `tls` block; TLS is governed by `HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME`. |
| `HERMEUM_AGENT_INGRESS_CLASS_NAME` | — | Ingress controller class name set on generated ingresses (`spec.ingressClassName`). Omitted from the CR when unset. |
| `HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME` | — | TLS secret name for controller-terminated TLS. When set, the ingress emits a `tls` block with this secret; when unset, no `tls` block is emitted (covers plain HTTP and load-balancer-terminated TLS). |

See [Per-agent ingress and TLS](../ingress-tls) for end-to-end TLS topologies.

### Web server

Hermeum's own HTTP(S) listener.

| Variable | Default | Description |
| --- | --- | --- |
| `HERMEUM_PORT` | `3000` | Port the web server listens on. |
| `HERMEUM_HMR_PORT` | `3001` | Port used by Vite's HMR websocket in dev. Ignored in production. |
| `HERMEUM_TLS_CERT_FILE` | — | Path to the web TLS cert file (PEM). When set **with** `HERMEUM_TLS_KEY_FILE`, the web server serves HTTPS on `HERMEUM_PORT`. |
| `HERMEUM_TLS_KEY_FILE` | — | Path to the web TLS key file (PEM). Pair with `HERMEUM_TLS_CERT_FILE`. |

### Webhook

The mutating admission webhook's HTTPS listener. It only starts when **both**
`HERMEUM_WEBHOOK_TLS_CERT_FILE` and `HERMEUM_WEBHOOK_TLS_KEY_FILE` are set;
otherwise the webhook is not served.

| Variable | Default | Description |
| --- | --- | --- |
| `HERMEUM_WEBHOOK_PORT` | `8443` | HTTPS port for the mutating admission webhook. Only used when the webhook TLS cert **and** key are set. |
| `HERMEUM_WEBHOOK_TLS_CERT_FILE` | — | Path to the mutating webhook TLS cert file (PEM). Pair with `HERMEUM_WEBHOOK_TLS_KEY_FILE` to start the webhook listener. |
| `HERMEUM_WEBHOOK_TLS_KEY_FILE` | — | Path to the mutating webhook TLS key file (PEM). Pair with `HERMEUM_WEBHOOK_TLS_CERT_FILE`. |

See [Mutating webhook](../mutating-webhook) for how the webhook is wired into
the cluster and how its `caBundle` gets populated.

## RBAC notes

Hermeum runs as a Kubernetes controller for `HermesAgent` CRs inside
`HERMEUM_KUBERNETES_NAMESPACE`. The chart's ServiceAccount grants the
following scoped permissions:

- **`hermesagents`** (custom resource): full CRUD within the configured
  namespace — Hermeum creates, patches, and finalizes agent CRs.
- **`secrets`**: read/write within the namespace, used to materialize
  per-agent image-pull secrets and TLS material referenced by ingresses.
- **`ingresses`** (`networking.k8s.io`): create/update/delete within the
  namespace when per-agent ingresses are enabled
  (`HERMEUM_AGENT_INGRESS_BASE_HOSTNAME` set).
- **`pods` / `pods/log`**: read, for status display and log streaming from
  agent pods.

When per-agent ingress is disabled (no base hostname), the `ingresses` grant
is unused in practice. If you deploy the chart into a namespace you do not own
and instead grant a narrower `Role` manually, ensure the four resource groups
above are still covered or the corresponding features will return RBAC
forbidden errors at runtime.

The mutating admission webhook is served by the same pod but on a separate
port (`HERMEUM_WEBHOOK_PORT`); it is authorized through the
`MutatingWebhookConfiguration`'s `clientConfig.service` path, not through the
pod ServiceAccount.