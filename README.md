# Hermeum

<p align="center">
  <img src="logo.png" alt="Hermeum logo" width="600" />
</p>

Hermeum is a platform for creating **tailored AI agents** for your team. Every
agent is built on top of the open-source
[Hermes agent](https://hermes-agent.nousresearch.com/docs), so it inherits
powerful built-in capabilities, while Hermeum gives you a simple way to shape,
run, and manage it.

Describe what you want your agent to do, and Hermeum turns that into a working
agent you can chat with, deploy, and iterate on.

## Features

<p align="center">
  <img src="assets/dashboard.png" alt="Hermeum dashboard — creating an agent" width="720" />
</p>

- **Tailor an agent by chat** — describe what your agent should do in natural
  language and Hermeum generates the configuration for you.
- **Templates** — create reusable agent templates for the agent shapes your
  team uses most.
- **Shared env sets** — share credentials (such as API keys) across agents
  without re-entering them each time.
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

## Documentation

Full documentation is published at [here](https://docs.hermeum.app).


| Document                                                                               | Description                                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [What is Hermeum](https://docs.hermeum.app/)                                           | Overview of the platform and what an agent can do.      |
| [Getting started](https://docs.hermeum.app/using-hermeum/getting-started/)             | Create, manage, and chat with your agents.              |
| [Creating an agent](https://docs.hermeum.app/using-hermeum/creating-an-agent/)         | How to shape an agent's soul, models, and skills.       |
| [Messaging platforms](https://docs.hermeum.app/using-hermeum/messaging-platforms/)     | Connect agents to Slack, Discord, Teams, and webhooks.  |
| [Shared env sets](https://docs.hermeum.app/using-hermeum/shared-env-sets/)             | Reuse environment sets across agents.                   |
| [Overview](https://docs.hermeum.app/operation/overview/)                               | Architecture and components for self-hosting.           |
| [Installation](https://docs.hermeum.app/operation/installation/)                       | Prerequisites, Helm install, database choice, upgrades. |
| [Configuration reference](https://docs.hermeum.app/operation/configuration-reference/) | Full `HERMEUM_*` environment variable reference.        |
| [Instance config](https://docs.hermeum.app/operation/instance-config/)                 | `config.yaml` schema for templates and agent types.     |
| [Database](https://docs.hermeum.app/operation/database/)                               | SQLite vs Postgres, migrations, scaling.                |
| [Auth](https://docs.hermeum.app/operation/auth/)                                       | Better Auth setup, secrets, email verification.         |
| [Mutating admission webhook](https://docs.hermeum.app/operation/mutating-webhook/)     | Admission webhook behavior and TLS options.             |
| [Per-agent ingress and TLS](https://docs.hermeum.app/operation/ingress-tls/)           | Ingress gateway and per-agent TLS.                      |


## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up a local development
environment and contribute to Hermeum.

## License

[AGPL-3.0-or-later](LICENSE)