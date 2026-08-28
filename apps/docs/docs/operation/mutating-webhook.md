---
title: Mutating admission webhook
description: What the webhook does, mutatingWebhookJsonPatch, test-op preconditions, and certificate options.
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

Mechanically, the webhook applies a JSON-Patch to every `HermesAgent` on
`CREATE`/`UPDATE`. It is served by the Hermeum pod on a separate HTTPS port
(`HERMEUM_WEBHOOK_PORT`, default `8443`) at `POST /webhook/mutating`, reached
directly by the kube-apiserver — not through any ingress. 

The listener only starts when **both** `HERMEUM_WEBHOOK_TLS_CERT_FILE` and
`HERMEUM_WEBHOOK_TLS_KEY_FILE` are set; otherwise the webhook is not served
and the `MutatingWebhookConfiguration` (if present) will fail closed.

## What it does

When the kube-apiserver sends an `AdmissionReview` for a `HermesAgent`, the
webhook:

1. Reads the incoming object's `type` (from the `hermeum.app/type`
   annotation).
2. Looks up `agentTypes[<type>].mutatingWebhookJsonPatch` in the loaded
   instance config — a list of candidate patches.
3. If candidates begin with `test` ops, evaluates each candidate's `test`
   ops against the incoming object and returns the **first** one whose tests
   all pass (first-match-wins). If none match, no patch is returned.
4. Returns that JSON-Patch ([RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902))
   as the admission response's `patch`.

If the type is unknown or has no `mutatingWebhookJsonPatch`, the webhook
returns no patch — i.e. it is a no-op. The webhook is therefore inert until
you populate at least one `agentTypes` entry with a non-empty patch.

## Configuring a patch

Patches live in the instance config under
`agentTypes.<type>.mutatingWebhookJsonPatch` (see
[Instance config](../instance-config) for the schema and how to mount a
custom `config.yaml` via `HERMEUM_CONFIG_PATH`).

The field accepts either a flat array (one candidate, the simplest form) or
an array of arrays (multiple candidates evaluated in order). A single flat
array is the most common case:

```yaml
agentTypes:
  my-type:
    description: Injects an annotation marking the agent type.
    mutatingWebhookJsonPatch:
      - op: add
        path: /metadata/annotations/hermeum.app~1type
        value: my-type
```

### Preconditions with `test` ops

A candidate patch can begin with [`test`](https://datatracker.ietf.org/doc/html/rfc6902#section-4.6)
ops to act as a precondition. Hermeum evaluates each candidate's `test` ops
against the incoming `HermesAgent` object and selects the **first** candidate
whose tests all pass. `test` ops that fail cause Hermeum to skip to the next
candidate — they do **not** reject the admission (unlike a flat array of
`test` ops, where a failing `test` would reject the whole request).

To express conditional mutation, provide multiple candidates as an array of
arrays:

```yaml
agentTypes:
  replica-setter:
    description: Sets replicas based on the agent's model.
    mutatingWebhookJsonPatch:
      # Candidate 1: only when spec.hermes.config.model.default is gpt-4
      - - op: test
          path: /spec/hermes/config/model/default
          value: gpt-4
        - op: add
          path: /spec/replicas
          value: 2
      # Candidate 2: only when spec.hermes.config.model.default is claude
      - - op: test
          path: /spec/hermes/config/model/default
          value: claude
        - op: add
          path: /spec/replicas
          value: 3
      # Candidate 3: unconditional fallback (no test ops)
      - - op: add
          path: /spec/replicas
          value: 1
```

In this example, Hermeum returns the first candidate whose `test` op matches
the incoming object. The last candidate has no `test` ops, so it always
matches — acting as a default/fallback. If no candidate matches (and there
is no unconditional fallback), the webhook returns no patch (no-op).

The selected candidate — **including its `test` ops** — is returned to
Kubernetes, which re-applies the full patch atomically. This gives defense in
depth: the `test` ops are re-asserted by the kube-apiserver at apply time.

Notes:

- `path` uses JSON-Pointer; `/` is escaped as `~1` (so
  `/metadata/annotations/hermeum.app~1type` targets the
  `hermeum.app/type` annotation).
- `test` ops compare the value at `path` against `value` using structural
  deep-equality (objects and arrays are compared recursively).
- A candidate with no `test` ops always matches — use this for an
  unconditional fallback.
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
are mounted into the Hermeum pod (setting
`HERMEUM_WEBHOOK_TLS_CERT_FILE` / `HERMEUM_WEBHOOK_TLS_KEY_FILE`), and a
post-install Job patches the CA into the webhook config's `caBundle`. To
bring your own cert instead, set `webhook.tls.existingSecret` and manage
issuance/rotation yourself (e.g. via cert-manager).
:::

See [Configuration reference](../configuration-reference) for the full
webhook env-var list, and [Per-agent ingress and TLS](../ingress-tls) for
the unrelated per-agent ingress TLS surface.