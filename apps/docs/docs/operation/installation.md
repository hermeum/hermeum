---
title: Installation
description: Prerequisites, Helm install, database choice, and agentConfig overrides.
sidebar_label: Installation
sidebar_position: 2
displayed_sidebar: docsSidebar
---

# Installation

This page covers prerequisites, install (sqlite
default + postgres), `agentConfig` overrides, upgrade, and troubleshooting. For
the architecture, see [Overview](../overview).

## Prerequisites

- A Kubernetes cluster.
- Helm 3.x.
- The [`hermes-agent-operator`](https://github.com/hermeum/hermes-agent-operator).
- An ingress controller — nginx / traefik / istio-ingress.
- (Optional) [cert-manager](https://cert-manager.io/)

### hermes-agent-operator

Hermeum depends on the [`hermes-agent-operator`](https://github.com/hermeum/hermes-agent-operator),
which installs the `HermesAgent` CRD and reconciles each CR into a running Hermes
agent. It ships as an OCI Helm chart at
`oci://ghcr.io/hermeum/charts/hermes-agent-operator` and is installed by default
as a dependency of this chart. To install it separately — e.g. for a single
cluster-wide reconciler shared by multiple Hermeum instances — see
[Installing the operator separately](#installing-the-operator-separately).

```bash
helm upgrade hermes-agent-operator \
  oci://ghcr.io/hermeum/charts/hermes-agent-operator \
  --install --namespace hermes-agent --create-namespace
```

### Ingress controller

Hermeum is exposed via an Ingress, so you need a controller installed in the
cluster. nginx-ingress, traefik, and istio-ingress all work. If you don't have
one yet, install one before proceeding — e.g. for nginx:

```bash
helm install nginx-ingress ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

For TLS termination with Let's Encrypt, also install
[cert-manager](https://cert-manager.io/) and a `ClusterIssuer`. See
[Ingress & TLS](../ingress-tls).

## Helm install

The only hard-required env var is `HERMEUM_DATABASE_URL`; see
[Configuration reference](../configuration-reference) for the full list. For
production you'll also want:

- `BETTER_AUTH_SECRET` — session signing secret for Better Auth (generate with
  `openssl rand -base64 32`).
- `HERMEUM_SMTP_URL` — SMTP server URL for outgoing email; needed for auth
  emails and notifications.
- `HERMEUM_OPENAI_API_KEY` — API key for the OpenAI-compatible API used by the
  AI config generator.

Everything else has working defaults. The
chart maps each env var to a value key (e.g. `HERMEUM_DATABASE_URL` ←
`secrets.databaseUrl`); see the chart's `values.yaml` for the full mapping.

### SQLite (default)

Recommended for a first install or a single-replica deployment.

```bash
helm install hermeum oci://ghcr.io/hermeum/charts/hermeum \
  --namespace hermeum --create-namespace \
  --set secrets.databaseUrl=file:/var/lib/hermeum/db.sqlite \
  --set secrets.betterAuthSecret=$(openssl rand -base64 32) \
  --set secrets.smtpUrl=smtps://user:pass@mail.example.com:465 \
  --set secrets.openaiApiKey=sk-...
```

A PVC (`persistence.mountPath` = `/var/lib/hermeum`) is mounted so the sqlite
file survives pod restarts. `replicaCount` **must** stay 1 — the PVC is
`ReadWriteOnce` and the chart's values schema enforces this. Migrations run as
an initContainer before the server starts. See [Database](../database) for more.

### Postgres

For horizontal scaling / HA.

```bash
helm install hermeum oci://ghcr.io/hermeum/charts/hermeum \
  --namespace hermeum --create-namespace \
  --set config.databaseDialect=postgres \
  --set secrets.databaseUrl=postgres://user:pass@db.example.com:5432/hermeum \
  --set secrets.betterAuthSecret=$(openssl rand -base64 32) \
  --set secrets.smtpUrl=smtps://user:pass@mail.example.com:465 \
  --set secrets.openaiApiKey=sk-...
```

The PVC is automatically disabled when `config.databaseDialect=postgres`, and
`replicaCount` can scale up. Use `secrets.existingSecret` to reference a Secret
you manage yourself (e.g. via External Secrets) instead of templating one. See
[Database](../database) for more.

## Installing the operator separately

By default this chart installs the `hermes-agent-operator` as a bundled Helm
dependency — one operator per Hermeum release, reconciling `HermesAgent` CRs in
the same namespace. Install the operator chart on its own when you want a
single cluster-wide reconciler shared by multiple Hermeum instances, or when
you prefer to manage the operator lifecycle (and CRD upgrades) independently.

```bash
helm upgrade hermes-agent-operator \
  oci://ghcr.io/hermeum/charts/hermes-agent-operator \
  --install --namespace hermes-agent --create-namespace
```

This installs the `HermesAgent` CRD and a Deployment that reconciles CRs across
the cluster. Then disable the bundled dependency so Hermeum's chart only manages
the dashboard:

```bash
helm install hermeum oci://ghcr.io/hermeum/charts/hermeum \
  --namespace hermeum --create-namespace \
  --set operator.enabled=false \
  --set secrets.databaseUrl=file:/var/lib/hermeum/db.sqlite \
  --set secrets.betterAuthSecret=$(openssl rand -base64 32) \
  --set secrets.smtpUrl=smtps://user:pass@mail.example.com:465 \
  --set secrets.openaiApiKey=sk-...
```

:::note
Only one operator should reconcile a given namespace at a time. If you've
previously installed Hermeum with the bundled operator, uninstall it first (or
ensure the cluster-wide operator is the only reconciler watching that
namespace) before flipping `operator.enabled=false`, to avoid two controllers
racing on the same `HermesAgent` CRs.
:::

Values under the chart's `operator.*` key are passed through to the
operator chart when the dependency is enabled. When installing the operator
separately, configure it via its own `values.yaml` — see
[hermes-agent-operator on GitHub](https://github.com/hermeum/hermes-agent-operator)
for the full values reference. For CRD upgrades when the operator is installed
separately, see [Upgrading](#upgrading).

## agentConfig overrides

`agentConfig` holds the full contents of `config.yaml`, mounted as a ConfigMap
at `HERMEUM_CONFIG_PATH`. When empty, the image's bundled `config.example.yaml`
is used as-is. This is where `templates` and
`agentTypes.<type>.mutatingWebhookJsonPatch` live — see
[Instance config](../instance-config) for the schema.

```yaml
# values.agentconfig.yaml
agentConfig:
  templates:
    - id: minimal
      name: Minimal
      description: Create an agent with minimal configuration.
      agentInput:
        config:
          model:
            base_url: https://ollama.com/v1
            default: kimi-k2.6
            provider: ollama-cloud
  agentTypes:
    my-type:
      description: Injects an annotation marking the agent type.
      mutatingWebhookJsonPatch:
        - op: add
          path: /metadata/annotations/hermeum.app~1type
          value: my-type
```

```bash
helm install hermeum oci://ghcr.io/hermeum/charts/hermeum \
  --namespace hermeum --create-namespace \
  --set secrets.databaseUrl=file:/var/lib/hermeum/db.sqlite \
  --set secrets.betterAuthSecret=$(openssl rand -base64 32) \
  --set secrets.smtpUrl=smtps://user:pass@mail.example.com:465 \
  --set secrets.openaiApiKey=sk-... \
  --values values.agentconfig.yaml
```

The mutating webhook is a no-op until you populate at least one `agentTypes`
entry with a non-empty `mutatingWebhookJsonPatch`. See
[Mutating webhook](../mutating-webhook) for what the webhook does and the
certificate options.

## Upgrading

1. Pull the latest chart:
   ```bash
   helm pull oci://ghcr.io/hermeum/charts/hermeum
   ```
2. Upgrade — migrations re-run as an initContainer and are idempotent:
   ```bash
   helm upgrade hermeum oci://ghcr.io/hermeum/charts/hermeum \
     --namespace hermeum \
     --reuse-values
   ```
3. To move to a new dashboard image, bump the chart version or set
   `image.tag` explicitly.
4. The pod rolls automatically when `agentConfig` changes — the Deployment
   carries a `checksum/agent-config` annotation.

:::note
Helm does not upgrade CRDs. If the `HermesAgent` CRD changed between releases,
check the operator's release notes and apply the CRD manifest manually:
```bash
kubectl apply -f <crd-manifest>.yaml
```
See [hermes-agent-operator on GitHub](https://github.com/hermeum/hermes-agent-operator).
:::

Helm prints the chart's `NOTES.txt` after install — read it for the install
summary and verification commands. For the full env-var reference, see
[Configuration reference](../configuration-reference).