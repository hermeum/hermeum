# Hermeum

Hermeum is a platform for creating **tailored AI agents** for your team. Every
agent is built on top of the open-source
[Hermes agent](https://hermes-agent.nousresearch.com/docs), so it inherits
powerful built-in capabilities, while Hermeum gives you a simple way to shape,
run, and manage it.

Describe what you want your agent to do, and Hermeum turns that into a working
agent you can chat with, deploy, and iterate on. An agent can answer questions,
research topics, browse the web, chat through Slack, Discord, Microsoft Teams,
or a custom webhook, run tasks on a schedule, and expose an OpenAI-compatible
API for other apps to use.

## Quick installation

Hermeum ships as a Helm chart (`charts/hermeum`) for Kubernetes. The only
hard-required value is `secrets.databaseUrl` (`HERMEUM_DATABASE_URL`).

```bash
helm install hermeum oci://ghcr.io/hermeum/charts/hermeum \
  --namespace hermeum --create-namespace \
  --set secrets.databaseUrl=file:/var/lib/hermeum/db.sqlite \
  --set secrets.betterAuthSecret=$(openssl rand -base64 32) \
  --set secrets.smtpUrl=smtps://user:pass@mail.example.com:465 \
  --set secrets.openaiApiKey=sk-...
```

For Postgres (horizontal scaling), set `config.databaseDialect=postgres` and a
Postgres `secrets.databaseUrl`. See the
[Installation guide](apps/docs/docs/operation/installation.md) and the
[chart README](charts/hermeum/README.md) for the full reference.

## Documentation

| Document | Description |
| --- | --- |
| [What is Hermeum](apps/docs/docs/intro.md) | Overview of the platform and what an agent can do. |
| [Getting started](apps/docs/docs/using-hermeum/getting-started.md) | Create, manage, and chat with your agents. |
| [Creating an agent](apps/docs/docs/using-hermeum/creating-an-agent.md) | How to shape an agent's soul, models, and skills. |
| [Messaging platforms](apps/docs/docs/using-hermeum/messaging-platforms.md) | Connect agents to Slack, Discord, Teams, and webhooks. |
| [Shared env sets](apps/docs/docs/using-hermeum/shared-env-sets.md) | Reuse environment sets across agents. |
| [Overview](apps/docs/docs/operation/overview.md) | Architecture and components for self-hosting. |
| [Installation](apps/docs/docs/operation/installation.md) | Prerequisites, Helm install, database choice, upgrades. |
| [Configuration reference](apps/docs/docs/operation/configuration-reference.md) | Full `HERMEUM_*` environment variable reference. |
| [Instance config](apps/docs/docs/operation/instance-config.md) | `config.yaml` schema for templates and agent types. |
| [Database](apps/docs/docs/operation/database.md) | SQLite vs Postgres, migrations, scaling. |
| [Auth](apps/docs/docs/operation/auth.md) | Better Auth setup, secrets, email verification. |
| [Mutating admission webhook](apps/docs/docs/operation/mutating-webhook.md) | Admission webhook behavior and TLS options. |
| [Per-agent ingress and TLS](apps/docs/docs/operation/ingress-tls.md) | Ingress gateway and per-agent TLS. |

## Contribution

TBU

## License

[AGPL-3.0-or-later](LICENSE)