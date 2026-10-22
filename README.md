# Hermeum

<p align="center">
  <img src="logo.png" alt="Hermeum logo" width="600" />
</p>

Hermeum is a platform for creating **fully autonomous Hermes agents** that work
on your team's behalf. Built on the open-source
[Hermes agent](https://hermes-agent.nousresearch.com/docs), every agent inherits
powerful built-in capabilities, while Hermeum gives you a simple way to shape,
run, and manage it.

Describe what you want your agent to do, and Hermeum turns that into a working
agent you can chat with, deploy, and iterate on.

## Features

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="assets/agents-list.png" alt="Agents list — running agents with status and created timestamps" width="480" />
      <br /><em>Agents list</em>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="assets/create-agent.png" alt="Create agent — chat on the left generates the agent config YAML on the right" width="480" />
      <br /><em>Create by chat</em>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="assets/agent-detail.png" alt="Agent detail — webhook endpoint, soul, and verified config" width="480" />
      <br /><em>Agent detail</em>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="assets/session-monitoring.png" alt="Session monitoring — live transcript beside a filterable stream of session events" width="480" />
      <br /><em>Session monitoring</em>
    </td>
  </tr>
</table>

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

## Quick installation

**Prerequisites:** a Kubernetes cluster and Helm 3.x.

Hermeum ships as a Helm chart (`charts/hermeum`) for Kubernetes. It installs
with sensible defaults; for production you'll want to set
`secrets.betterAuthSecret`, `secrets.smtpUrl`, and `secrets.openaiApiKey`.

```bash
helm install hermeum oci://ghcr.io/hermeum/charts/hermeum \
  --namespace hermeum --create-namespace \
  --set secrets.betterAuthSecret=$(openssl rand -base64 32) \
  --set secrets.smtpUrl=smtps://user:pass@mail.example.com:465 \
  --set secrets.openaiApiKey=sk-...
```

For Postgres (horizontal scaling), set `config.databaseDialect=postgres` and a
Postgres `secrets.databaseUrl`. See the
[Installation guide](https://docs.hermeum.app/operation/installation/) and the
[chart README](charts/hermeum/README.md) for the full reference.

## Demo

Want to let people try Hermeum without setting up sign-in? Run it in **demo
mode** on a local cluster.

> **Demo mode is not for production.** It disables sign-in entirely and maps
> every visitor to a single shared demo user, so anyone with the URL can see and
> edit the same agents and shared env sets. Run it on a throwaway cluster and
> tear it down when you're done.

```bash
# 1. Create a local cluster (kind shown; minikube/k3d work too).
kind create cluster --name hermeum-demo

# 2. Install Hermeum with sign-in disabled.
helm install hermeum oci://ghcr.io/hermeum/charts/hermeum \
  --namespace hermeum --create-namespace \
  --set config.demoMode=true \
  --set secrets.betterAuthSecret=$(openssl rand -base64 32)

# 3. Open the UI at http://localhost:3000 — no sign-in required.
kubectl port-forward -n hermeum svc/hermeum 3000:3000
```

The `secrets.betterAuthSecret` value is required for the app to boot, but in
demo mode no sign-in sessions are ever issued, so any random value works.

To try the "create an agent by chat" flow, also pass an OpenAI-compatible key
(without it, you can still create agents from templates or a hand-written
config):

```bash
--set secrets.openaiApiKey=sk-...
```

Clean up with `kind delete cluster --name hermeum-demo`.

## Documentation

Full documentation is published at [here](https://docs.hermeum.app).


| Document                                                                               | Description                                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [What is Hermeum](https://docs.hermeum.app/)                                           | Overview of the platform and what an agent can do.      |
| [Getting started](https://docs.hermeum.app/using-hermeum/getting-started/)             | Create, manage, and chat with your agents.              |
| [Creating an agent](https://docs.hermeum.app/using-hermeum/creating-an-agent/)         | How to shape an agent's soul, models, and skills.       |
| [Shared env sets](https://docs.hermeum.app/using-hermeum/shared-env-sets/)             | Reuse environment sets across agents.                   |
| [Overview](https://docs.hermeum.app/operation/overview/)                               | Architecture and components for self-hosting.           |
| [Installation](https://docs.hermeum.app/operation/installation/)                       | Prerequisites, Helm install, database choice, upgrades. |
| [Configuration reference](https://docs.hermeum.app/operation/configuration-reference/) | Full `HERMEUM_*` environment variable reference.        |
| [Instance config](https://docs.hermeum.app/operation/instance-config/)                 | `config.yaml` schema for templates and agent types.     |
| [Database](https://docs.hermeum.app/operation/database/)                               | SQLite vs Postgres, migrations, scaling.                |
| [Auth](https://docs.hermeum.app/operation/auth/)                                       | Better Auth setup, secrets, email verification.         |
| [Mutating admission webhook](https://docs.hermeum.app/operation/mutating-webhook/)     | Admission webhook behavior and TLS options.             |
| [Per-agent ingress and TLS](https://docs.hermeum.app/operation/ingress-tls/)           | Ingress gateway and per-agent TLS.                      |


## Community

Join the [Hermeum Discord](https://discord.gg/ZW44yyCAHP) to ask questions,
share what you're building, and talk to the team.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up a local development
environment and contribute to Hermeum.

## License

[AGPL-3.0-or-later](LICENSE)