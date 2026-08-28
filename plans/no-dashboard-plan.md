# Plan: Why Hermeum Has No Configuration Dashboard

> **Goal:** Explain why Hermeum does not support configuring agents through a
> dashboard.

## Why no dashboard

Hermeum configures a Hermes agent as a single manifest — the `HermesAgent` CR
embeds the agent's `config.yaml` and all of its settings in one declarative
artifact. The operator reconciles that manifest into a running pod; the
mutating webhook patches it on `CREATE`/`UPDATE`. The manifest is the whole
configuration.

A dashboard breaks this model because it would **admit updating
configuration while ignoring the manifest**. The moment someone edits a
field in the UI, the live state diverges from the CR — and the next
reconcile loop either overwrites the dashboard change or is forced to write
back to the CR, at which point the dashboard is just a slow, lossy CR editor
that bypasses GitOps, audit, and rollback.

- **The manifest embeds `config.yaml`.** Every Hermes agent setting lives in
  the CR. There is no separate config surface for a dashboard to own.
- **Reconciliation fights imperative edits.** A dashboard edit is an
  out-of-band change the reconciler does not know about; it gets undone or it
  silently drifts.
- **Configuration-as-code is the point.** Hermeum targets self-hosted
  Kubernetes operators who expect declarative, version-controlled
  configuration with diff, blame, and rollback — none of which survive a
  dashboard write path.

## What the UI does instead

The web app is not a config editor. It surfaces state (what agents exist,
their status) and provides an AI config generator that authors manifests.
To change an agent's model, skills, or endpoints: edit the manifest or
regenerate it via the config chat. There is no "Settings → Save" flow.

## Hoisting agent-level state into Hermeum

Today memories, sessions, and logs live *inside* each Hermes agent pod —
invisible to siblings, coupled to the pod's lifecycle, and ungovernable
without reaching into a pod. Hermeum will hoist these from the Hermes agent
level into the Hermeum control-plane level, making them first-class Hermeum
resources: durable independent of any one agent, shareable across agents,
and governable from the control plane.