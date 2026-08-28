# Contributing

Thanks for your interest in contributing to Hermeum! This guide covers how to
set up a local development environment.

## Prerequisites

Before you begin, make sure you have the following installed and running:

- **Node.js** >= 22 (the repo pins `24.14` in `.nvmrc` — run `nvm use` to match)
  and **pnpm** >= 9
- **Kubernetes** — a running cluster (e.g. [kind](https://kind.sigs.k8s.io/),
  [minikube](https://minikube.sigs.k8s.io/), or a remote cluster) with your
  kubecontext pointed at it. Hermeum deploys agents as `HermesAgent` custom
  resources, so the cluster must be reachable from your machine.
- **[Hermes Agent Operator](https://github.com/hermeum/hermes-agent-operator)**
  installed on the cluster. The operator reconciles `HermesAgent` resources into
  running pods; without it, agents created through the UI will never become
  ready. Install it with Helm:

  ```bash
  helm upgrade hermes-agent-operator oci://ghcr.io/hermeum/charts/hermes-agent-operator \
    --install --namespace hermes-agent --create-namespace
  ```

## Local development setup

1. **Install dependencies** from the repo root:

   ```bash
   pnpm install
   ```

2. **Create an environment file** at `apps/app/.env` with the following
   variables:

   ```dotenv
   HERMEUM_CONFIG_PATH=config.default.yaml
   HERMEUM_KUBERNETES_NAMESPACE=default
   HERMEUM_DATABASE_URL=file://sqlite.db
   HERMEUM_OPENAI_API_KEY=<your-openai-api-key>
   ```

   | Variable | Description |
   | --- | --- |
   | `HERMEUM_CONFIG_PATH` | Path (relative to `apps/app`) to the default agent config file. The checked-in `config.default.yaml` defines the built-in templates. |
   | `HERMEUM_KUBERNETES_NAMESPACE` | Kubernetes namespace where Hermeum will create and watch `HermesAgent` resources. Must match a namespace your kubecontext can access. |
   | `HERMEUM_DATABASE_URL` | Connection URL for the app database. Use the `file://` scheme for local SQLite, e.g. `file://sqlite.db`. |
   | `HERMEUM_OPENAI_API_KEY` | OpenAI API key used by the chat use cases that tailor agent configurations. |

3. **Run database migrations**:

   ```bash
   pnpm --filter @hermeum/app drizzle:migrate
   ```

   This creates the SQLite database file (`apps/app/sqlite.db`) and applies the
   Better Auth and application schemas.

4. **Start the dev server**:

   ```bash
   pnpm --filter @hermeum/app dev
   ```

   The app is available at <http://localhost:3000>.

## Common tasks

From the repo root (via Turbo) or scoped to a package with `pnpm --filter`:

| Task | Command |
| --- | --- |
| Build (all) | `pnpm build` |
| Typecheck (all) | `pnpm typecheck` |
| Lint (all) | `pnpm lint` |
| Tests (all) | `pnpm test` |
| Format | `pnpm format` / `pnpm format:check` |
| Clean | `pnpm clean` |

See `AGENTS.md` for the full repository layout and per-package commands.