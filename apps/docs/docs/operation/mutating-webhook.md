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
  medium:
    description: Medium resource profile — 2 CPU / 1Gi, limits 4 CPU / 2Gi.
    mutatingWebhookJsonPatch:
      - op: add
        path: /spec/hermes/resources
        value:
          requests: { cpu: "2", memory: 1Gi }
          limits:   { cpu: "4", memory: 2Gi }
```

When an agent with `type: medium` is created or updated, the webhook injects
the resource requests and limits into `spec.hermes.resources`.

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
  medium:
    description: >-
      Medium resource profile — 2 CPU / 1Gi, limits 4 CPU / 2Gi.
      Applies proportional resources to the searxng and camofox sidecars
      when they are enabled.
    mutatingWebhookJsonPatch:
      # Both sidecars enabled — patch all three.
      - - op: test
          path: /spec/searxng/enabled
          value: true
        - op: test
          path: /spec/camofox/enabled
          value: true
        - op: add
          path: /spec/hermes/resources
          value:
            requests: { cpu: "2", memory: 1Gi }
            limits:   { cpu: "4", memory: 2Gi }
        - op: add
          path: /spec/searxng/resources
          value:
            requests: { cpu: 500m, memory: 512Mi }
            limits:   { cpu: "1", memory: 1Gi }
        - op: add
          path: /spec/camofox/resources
          value:
            requests: { cpu: "1", memory: 1Gi }
            limits:   { cpu: "2", memory: 2Gi }
      # Searxng only.
      - - op: test
          path: /spec/searxng/enabled
          value: true
        - op: add
          path: /spec/hermes/resources
          value:
            requests: { cpu: "2", memory: 1Gi }
            limits:   { cpu: "4", memory: 2Gi }
        - op: add
          path: /spec/searxng/resources
          value:
            requests: { cpu: 500m, memory: 512Mi }
            limits:   { cpu: "1", memory: 1Gi }
      # Camofox only.
      - - op: test
          path: /spec/camofox/enabled
          value: true
        - op: add
          path: /spec/hermes/resources
          value:
            requests: { cpu: "2", memory: 1Gi }
            limits:   { cpu: "4", memory: 2Gi }
        - op: add
          path: /spec/camofox/resources
          value:
            requests: { cpu: "1", memory: 1Gi }
            limits:   { cpu: "2", memory: 2Gi }
      # Neither sidecar enabled (unconditional fallback).
      - - op: add
          path: /spec/hermes/resources
          value:
            requests: { cpu: "2", memory: 1Gi }
            limits:   { cpu: "4", memory: 2Gi }
```

In this example, Hermeum returns the first candidate whose `test` ops match
the incoming object. The last candidate has no `test` ops, so it always
matches — acting as a default/fallback that applies the hermes container
resources even when neither sidecar is enabled. JSON-Patch `add` requires the
parent path to exist, so the searxng/camofox resource patches are gated on
`/spec/searxng/enabled` and `/spec/camofox/enabled` (the operator only
emits those objects when the agent opts into the sidecar). If no candidate
matches (and there is no unconditional fallback), the webhook returns no
patch (no-op).

The selected candidate — **including its `test` ops** — is returned to
Kubernetes, which re-applies the full patch atomically. This gives defense in
depth: the `test` ops are re-asserted by the kube-apiserver at apply time.


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