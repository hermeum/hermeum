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
- Your cluster can pull from `ghcr.io`.
- An ingress controller — nginx / traefik / istio-ingress.
- (Optional) [cert-manager](https://cert-manager.io/)

## Helm install

The only hard-required value is `secrets.databaseUrl`
(`HERMEUM_DATABASE_URL`); see [Configuration reference](../configuration-reference)
for the full list. For production you'll also want:

- `secrets.betterAuthSecret` — session signing secret for Better Auth
  (generate with `openssl rand -base64 32`).
- `secrets.smtpUrl` — SMTP server URL for outgoing email
  (`HERMEUM_SMTP_URL`); needed for auth emails and notifications.
- `secrets.openaiApiKey` — API key for the OpenAI-compatible API used by the
  AI config generator (`HERMEUM_OPENAI_API_KEY`).

Everything else — including the dashboard image — has working defaults.

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

The PVC is skipped and `replicaCount` can scale up. Use
`secrets.existingSecret` to reference a Secret you manage yourself (e.g. via
External Secrets) instead of templating one. See [Database](../database) for
more.

## agentConfig overrides

`agentConfig` holds the full contents of `config.yaml`, mounted as a ConfigMap
at `config.configPath`. When empty, the image's bundled `config.example.yaml`
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

## Troubleshooting

- **Webhook `caBundle` empty** — the post-install Job patches it. Verify:
  ```bash
  kubectl get mutatingwebhookconfiguration hermeum \
    -o jsonpath='{.webhooks[0].clientConfig.caBundle}' | base64 -d | openssl x509 -text
  ```
- **Pod `CrashLoopBackOff` / `ImagePullBackOff`** — confirm the cluster can
  pull `ghcr.io/hermeum/hermeum` (auth if private), that `HERMEUM_DATABASE_URL`
  is set and reachable, and — for sqlite — that the PVC is mounted at
  `/var/lib/hermeum`.
- **Migrations stuck** — check the initContainer logs:
  ```bash
  kubectl logs <pod> -c migrate -n hermeum
  ```
- **`replicaCount must be 1` schema error** — you're on sqlite; either keep one
  replica or switch to postgres.
- **Web server not reachable** — if `ingress.enabled=false`, port-forward:
  ```bash
  kubectl -n hermeum port-forward svc/hermeum 3000:3000
  ```
  then open [http://localhost:3000](http://localhost:3000).

Helm prints the chart's `NOTES.txt` after install — read it for the install
summary and verification commands. For the full env-var list, see
[Configuration reference](../configuration-reference).