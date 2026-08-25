---
title: Mutating admission webhook
description: What the webhook does, mutatingWebhookJsonPatch, and certificate options.
sidebar_label: Mutating webhook
sidebar_position: 7
displayed_sidebar: docsSidebar
---

# Mutating admission webhook

The mutating admission webhook is the layer that customizes each
`HermesAgent` custom resource **according to its purpose, at the
infrastructure level** — so users can create an agent by describing what it
should do, without having to understand the `HermesAgent` spec or hand-edit
the fields an operator cares about. 

Mechanically, the webhook applies that JSON-Patch to every `HermesAgent` on
`CREATE`/`UPDATE`. It is served by the Hermeum pod on a separate HTTPS port
(`HERMEUM_WEBHOOK_PORT`, default `8443`) at `POST /webhook/mutating`, reached
directly by the kube-apiserver — not through any ingress. 

The listener only starts when **both** `HERMEUM_WEBHOOK_TLS_CERT_FILE` and
`HERMEUM_WEBHOOK_TLS_KEY_FILE` are set; otherwise the webhook is not served
and the `MutatingWebhookConfiguration` (if present) will fail closed.

## What it does

When the kube-apiserver sends an `AdmissionReview` for a `HermesAgent`, the
webhook:

1. Reads the incoming object's `spec.type`.
2. Looks up `agentTypes[<type>].mutatingWebhookJsonPatch` in the loaded
   instance config.
3. Returns that JSON-Patch ([RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902))
   as the admission response's `patch`.

If the type is unknown or has no `mutatingWebhookJsonPatch`, the webhook
returns no patch — i.e. it is a no-op. The webhook is therefore inert until
you populate at least one `agentTypes` entry with a non-empty patch.

## Configuring a patch

Patches live in the instance config under
`agentTypes.<type>.mutatingWebhookJsonPatch` (see
[Instance config](../instance-config) for the schema and how to mount a
custom `config.yaml` via `HERMEUM_CONFIG_PATH`).

A common use is stamping an annotation that records the agent's type:

```yaml
agentTypes:
  my-type:
    description: Injects an annotation marking the agent type.
    mutatingWebhookJsonPatch:
      - op: add
        path: /metadata/annotations/hermeum.app~1type
        value: my-type
```

Notes:

- `path` uses JSON-Pointer; `/` is escaped as `~1` (so
  `/metadata/annotations/hermeum.app~1type` targets the
  `hermeum.app/type` annotation).
- The patch is applied to the `HermesAgent` CR itself, not to the rendered
  StatefulSet. To mutate the agent pod, target fields the operator reads from
  the CR (e.g. `spec.env`, `spec.config`).
- Setting an agent's `type` to a key that is not in `agentTypes` is rejected
  by Hermeum on create/update, so the webhook only ever sees known types.

## Certificates

The webhook is an HTTPS server terminated in-process; the kube-apiserver
validates it against the `caBundle` set on the `MutatingWebhookConfiguration`.
You need (a) a serving cert + key mounted into the pod and pointed at by
`HERMEUM_WEBHOOK_TLS_CERT_FILE` / `HERMEUM_WEBHOOK_TLS_KEY_FILE`, and (b) the
matching CA in the webhook config's `caBundle`.

| Variable | Default | Description |
| --- | --- | --- |
| `HERMEUM_WEBHOOK_PORT` | `8443` | HTTPS port the webhook listens on. |
| `HERMEUM_WEBHOOK_TLS_CERT_FILE` | — | Path to the serving cert (PEM). Pair with `HERMEUM_WEBHOOK_TLS_KEY_FILE` to start the listener. |
| `HERMEUM_WEBHOOK_TLS_KEY_FILE` | — | Path to the serving key (PEM). Pair with `HERMEUM_WEBHOOK_TLS_CERT_FILE`. |

For how to create and configure a `MutatingWebhookConfiguration` and its
serving certificate (the `caBundle`, `clientConfig.service`, failure policy,
and rules), see the upstream Kubernetes guide:
[Dynamic Admission Control](https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/).

:::note
When you install via the Helm chart, the `MutatingWebhookConfiguration`
and its TLS certificate are created for you automatically — a pre-install
Job generates a self-signed CA + serving cert into a Secret, the cert/key
are mounted into the dashboard pod (setting
`HERMEUM_WEBHOOK_TLS_CERT_FILE` / `HERMEUM_WEBHOOK_TLS_KEY_FILE`), and a
post-install Job patches the CA into the webhook config's `caBundle`. To
bring your own cert instead, set `webhook.tls.existingSecret` and manage
issuance/rotation yourself (e.g. via cert-manager).
:::

See [Configuration reference](../configuration-reference) for the full
webhook env-var list, and [Per-agent ingress and TLS](../ingress-tls) for
the unrelated per-agent ingress TLS surface.