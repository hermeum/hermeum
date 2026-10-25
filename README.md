# Hermeum

<p align="center">
  <img src="logo.png" alt="Hermeum logo" width="400" />
</p>

**Fully autonomous Hermes agents, shaped by a sentence — deployed, monitored, and managed from one dashboard.**

## See it in action

<p align="center">
  <video src="assets/code-reviewer-demo.mp4" alt="Code reviewer agent demo" width="720" autoplay muted loop playsinline controls></video>
</p>

## Features

- **Tailor an agent by chat** — describe what your agent should do in natural
  language and Hermeum generates the configuration for you.
- **Templates** — create reusable agent templates for the agent shapes your
  team uses most.
- **Shared env sets** — share credentials (such as API keys) across agents
  without re-entering them each time.
- **Session monitoring** — inspect every agent session as a live transcript
  beside a stream of telemetry events (model calls, tool calls, errors).
- **Powered by Kubernetes** — agents run as `HermesAgent` custom resources, with
  a mutating admission webhook that shapes each agent at creation time.

## Why Hermeum instead of running Hermes directly?

A [Hermes agent](https://hermes-agent.nousresearch.com/docs) is one agent you run
yourself: you hand-write its `config.yaml`, start it, and manage it on your own
machine. Hermeum adds the control plane around it:

- **Describe, don't configure** — turn a plain-English sentence into a working
  agent configuration instead of editing YAML by hand.
- **Manage many agents, not one** — each agent is a `HermesAgent` resource,
  reconciled by the operator into its own running pod on Kubernetes.
- **Reuse what you build** — templates and shared env sets let a team standardize
  agent shapes and credentials across every agent.
- **Watch what they do** — session monitoring surfaces every transcript and
  telemetry event (model calls, tool calls, errors) in one place.

## Quick installation

**Prerequisites:** a Kubernetes cluster and [Helm](https://helm.sh/) 3.x.

Hermeum ships as a Helm chart (`charts/hermeum`) for Kubernetes. It installs
with sensible defaults. For production, set the three secret values shown
below: `secrets.betterAuthSecret`, `secrets.smtpUrl`, and `secrets.openaiApiKey`.

```bash
helm install hermeum oci://ghcr.io/hermeum/charts/hermeum \
  --namespace hermeum --create-namespace \
  --set secrets.betterAuthSecret=$(openssl rand -base64 32) \
  --set secrets.smtpUrl=smtps://user:pass@mail.example.com:465 \
  --set secrets.openaiApiKey=sk-...
```

See the
[Installation guide](https://docs.hermeum.app/operation/installation/) and the
[chart README](charts/hermeum/README.md) for the full reference.

## Local demo

A quick way to look around Hermeum on your local machine. Install
[kind](https://kind.sigs.k8s.io/) and [Helm](https://helm.sh/) first.

> Auth-disabled mode is not for production — run it on a throwaway local
> cluster and tear it down when you're done.

```bash
# 1. Create a local cluster (kind shown; minikube/k3d work too).
kind create cluster --name hermeum-demo

# 2. Install Hermeum with auth disabled.
helm install hermeum oci://ghcr.io/hermeum/charts/hermeum \
  --namespace hermeum --create-namespace \
  --set config.authDisabled=true \
  --set secrets.betterAuthSecret=$(openssl rand -base64 32)

# 3. Open the UI at http://localhost:3000.
kubectl port-forward -n hermeum svc/hermeum 3000:3000
```

To try the "create an agent by chat" flow, also pass an OpenAI-compatible key
(without it, you can still create agents from templates or a hand-written
config):

```bash
--set secrets.openaiApiKey=sk-...
```

Clean up with `kind delete cluster --name hermeum-demo`.

## Documentation

Full documentation is available at [docs.hermeum.app](https://docs.hermeum.app).

## Community

Join the [Hermeum Discord](https://discord.gg/ZW44yyCAHP) to ask questions,
share what you're building, and talk to the team.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up a local development
environment and contribute to Hermeum.

## License

[AGPL-3.0-or-later](LICENSE)
