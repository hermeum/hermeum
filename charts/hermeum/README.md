# hermeum

Helm chart for the [Hermeum](https://github.com/hermeum/hermeum) control plane — the
component that reconciles `HermesAgent` custom resources via the
`hermes-agent-operator`.

The hermeum app is a Node/Express server that exposes:

| Port  | Scheme | Path(s)                                  | Consumer                        |
|-------|--------|------------------------------------------|---------------------------------|
| 3000  | HTTP   | `/`, `/auth/*`, `/trpc`, `/chat`         | UI + tRPC + AI config generator |
| 8443  | HTTPS  | `/webhook/mutating`                      | kube-apiserver (admission webhook) |

The HTTP port is fronted by an optional ingress gateway; the HTTPS port is
reached directly by the kube-apiserver via a `MutatingWebhookConfiguration`.
TLS on 8443 is terminated **in-process** by the hermeum server (see the
companion PR that implements in-process TLS termination).

## Dependencies

This chart depends on the `hermes-agent-operator` chart, distributed as an OCI
artifact:

```
oci://ghcr.io/hermeum/charts/hermes-agent-operator
```

The operator installs the `HermesAgent` CRD (`agents.hermeum.app/v1alpha1`) and
the reconciler. `helm dependency build` fetches it; `operator.enabled=false`
skips it when the operator is already installed cluster-wide.

```bash
helm dependency build charts/hermeum
```

## Install

```bash
# HERMEUM_DATABASE_URL defaults to file:/var/lib/hermeum/db.sqlite (bundled
# sqlite + PVC); override it with secrets.databaseUrl for other setups.
helm install hermeum charts/hermeum \
  --namespace hermeum --create-namespace
```

With an external Postgres:

```bash
helm install hermeum charts/hermeum \
  --namespace hermeum --create-namespace \
  --set config.databaseDialect=postgres \
  --set secrets.databaseUrl=postgres://user:pass@db.example.com:5432/hermeum
```

With an agentConfig override that drives the mutating webhook:

```bash
helm install hermeum charts/hermeum \
  --namespace hermeum --create-namespace \
  --values values.agentconfig.yaml
```

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

## Required values

None — every value has a working default. `secrets.databaseUrl` defaults to
`file:/var/lib/hermeum/db.sqlite` (the bundled sqlite path); set
`secrets.betterAuthSecret` for auth to actually issue sessions, e.g. via
`--set secrets.betterAuthSecret=$(openssl rand -base64 32)`.

All other env vars have defaults (see `apps/app/src/server/libs/config.ts`
for the authoritative list + semantics, and `values.yaml` for the chart-side
documentation).

## Mutating webhook for HermesAgent

When `webhook.enabled` (default `true`), the chart ships:

1. A `MutatingWebhookConfiguration` admitting `CREATE`/`UPDATE` on
   `agents.hermeum.app/v1alpha1` `hermesagents`, dispatching
   `AdmissionReview`s to the hermeum app's `POST /webhook/mutating`.
2. A pre-install Job that generates a self-signed CA + serving cert and writes
   them to a `<release>-webhook-tls` Secret (skipped when
   `webhook.tls.existingSecret` is set).
3. A post-install Job that patches the CA into the `MutatingWebhookConfiguration`'s
   `caBundle` (Helm can't template Secret contents).
4. Dedicated hook-phase ServiceAccount + RBAC (cluster-scoped for the webhook
   patch) so the hooks work even though they run before the main resources.

The webhook returns a JSON-Patch drawn from
`agentConfig.agentTypes[agent.type].mutatingWebhookJsonPatch` — so it is a
no-op until the operator populates `agentConfig` with at least one
`agentTypes` entry whose `mutatingWebhookJsonPatch` is non-empty.

### Operator-supplied cert

Set `webhook.tls.existingSecret` to an existing `kubernetes.io/tls`-style Secret
containing `tls.crt`, `tls.key`, and `ca.crt`. The chart skips cert generation
and mounts the Secret; the operator is then responsible for ensuring the
`MutatingWebhookConfiguration`'s `caBundle` matches `ca.crt` (e.g. via
cert-manager's `cert-manager.io/inject-ca-from` annotation).

## Ingress gateway (optional)

`ingress.enabled=true` emits a standard `networking.k8s.io/Ingress` for the UI
on port 3000. Controller selection is via `ingress.className`
(`nginx` / `istio-ingress` / `traefik` / …). This is **not** used for the
mutating webhook, which is served on the internal 8443 Service directly by
the kube-apiserver.

## Database

- **sqlite** (default): a PVC is mounted at `persistence.mountPath`
  (`/var/lib/hermeum`); `secrets.databaseUrl` defaults to
  `file:<mountPath>/db.sqlite`. `replicaCount` must stay 1 (ReadWriteOnce PVC).
- **postgres**: set `config.databaseDialect=postgres` and `secrets.databaseUrl`
  to the Postgres connection URL. The PVC is skipped and `replicaCount` can
  scale up.

Migrations run as an initContainer (`migrations.enabled`, default `true`)
before the server starts, using the image's bundled `drizzle-kit` +
per-dialect SQL. Disable only if you run migrations out-of-band.

## RBAC

The hermeum app's ServiceAccount is granted a namespace-scoped `Role` over:
- `agents.hermeum.app/hermesagents` — full CRUD (reconciles agent CRs)
- `configmaps`, `secrets` — full CRUD (per-agent env + shared env sets)

The webhook cert-provisioning hooks use a **separate** ServiceAccount
(`<release>-webhook-cert`) with a cluster-scoped `ClusterRole` over
`mutatingwebhookconfigurations` (needed only for the post-install caBundle
patch). This keeps the hermeum app's own RBAC narrowly namespace-scoped.

## Values

See `values.yaml` for the full, documented list. Run `helm show values` for a
rendered view:

```bash
helm show values charts/hermeum
```

### Notable values

| Key                                 | Default                          | Description                                   |
|-------------------------------------|----------------------------------|-----------------------------------------------|
| `image.repository`                   | `ghcr.io/hermeum/hermeum`       | Hermeum image. No published image yet — set this. |
| `operator.enabled`                   | `true`                           | Install `hermes-agent-operator` as a dependency. |
| `config.databaseDialect`             | `sqlite`                         | `sqlite` or `postgres`.                       |
| `secrets.databaseUrl`                | `"file:/var/lib/hermeum/db.sqlite"` | `HERMEUM_DATABASE_URL`. Override for postgres. |
| `secrets.existingSecret`             | `""`                             | Use an existing Secret instead of templating one. |
| `agentConfig`                        | `{}`                             | Full `config.yaml` content (mounted as a ConfigMap). |
| `webhook.enabled`                    | `true`                           | Ship the MutatingWebhookConfiguration.        |
| `webhook.tls.existingSecret`         | `""`                             | Skip chart cert generation; use operator's.   |
| `ingress.enabled`                    | `false`                          | Emit a UI Ingress.                            |
| `persistence.enabled`                | `true`                           | PVC for sqlite (ignored for postgres).       |

## TLS

The hermeum app (PR #108) terminates TLS in-process via Node's `https` module.
This chart wires the env vars that drive it.

### Mutating webhook TLS

The webhook HTTPS listener starts when both cert + key files are present. The
chart auto-provisions a self-signed CA + serving cert (or mounts an
operator-supplied Secret via `webhook.tls.existingSecret`).

| Env var                            | Source                          | Meaning                                  |
|------------------------------------|---------------------------------|------------------------------------------|
| `HERMEUM_WEBHOOK_TLS_CERT_FILE`    | `webhook.tls.certFile`          | Path to the serving cert (`tls.crt`).    |
| `HERMEUM_WEBHOOK_TLS_KEY_FILE`     | `webhook.tls.keyFile`           | Path to the serving key (`tls.key`).    |
| `HERMEUM_WEBHOOK_PORT`             | `webhook.port`                  | The HTTPS port to listen on.            |

### Web server TLS (optional)

The UI/trpc/auth/chat listener serves HTTPS when both cert + key files are
present (`config.webTls.certFile` / `keyFile` + `secretName`). This is an
alternative to the ingress gateway for terminating TLS in-process. Probes
switch to `httpsGet` automatically when web TLS is enabled.

| Env var                    | Source                       | Meaning                                  |
|----------------------------|------------------------------|------------------------------------------|
| `HERMEUM_TLS_CERT_FILE`    | `config.webTls.certFile`     | Path to the web serving cert.            |
| `HERMEUM_TLS_KEY_FILE`     | `config.webTls.keyFile`      | Path to the web serving key.             |
| `HERMEUM_PORT`             | `config.port`                | The web server port (HTTP or HTTPS).     |