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

## Testing the chart on a local Kubernetes cluster

Run the app in-cluster against a locally built image, exposed through a
Cloudflare Tunnel. 

### 1. Build the app image

Build docker image:

```bash
docker build -f dockerfiles/Dockerfile.app -t hermeum:<tag> .
```

### 2. Install ingress-nginx


Install commands:

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx -n hermeum --create-namespace
kubectl -n hermeum get pods   # wait for Running
kubectl get ingressclass      # expect "nginx"
```

### 3. Set up the Cloudflare tunnel

1. Create the tunnel in the dashboard: Zero Trust → Networks → Tunnels →
   Create a tunnel → cloudflared, then copy the `eyJ...` token.
2. Store the token and deploy the in-cluster connector (manifest below).
3. Add a route on the tunnel page → Routes → Add a route → Public hostname:
   `<sub>.<domain>`, type HTTP, service
   `http://ingress-nginx-controller.hermeum.svc.cluster.local:80` — the
   namespace must match step 2. Each entry auto-creates the proxied CNAME.

```bash
kubectl -n hermeum create secret generic cloudflared-token \
  --from-literal=TUNNEL_TOKEN=<token> --dry-run=client -o yaml | kubectl apply -f -
```

<details>
<summary>Cloudflared deployment manifest</summary>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudflared
  namespace: hermeum
spec:
  replicas: 1
  selector:
    matchLabels: { app: cloudflared }
  template:
    metadata:
      labels: { app: cloudflared }
    spec:
      containers:
        - name: cloudflared
          image: cloudflare/cloudflared:latest
          args: ["tunnel", "--no-autoupdate", "run"]
          env:
            - name: TUNNEL_TOKEN
              valueFrom:
                secretKeyRef:
                  name: cloudflared-token
                  key: TUNNEL_TOKEN
```

</details>

### 4. Add values-local.yaml with the local image

`charts/hermeum/values-local.yaml` is gitignored — keep secrets out of git.
`ingress.host` must match the tunnel route hostname and `betterAuthUrl` the
external URL; TLS stays off because the tunnel terminates it.

<details>
<summary>values-local.yaml</summary>

```yaml
image:
  repository: hermeum
  tag: <tag>
config:
  kubernetesNamespace: hermeum     # namespace for HermesAgent CRs
  betterAuthUrl: https://<hostname>
operator:
  enabled: true
secrets:
  betterAuthSecret: "<openssl rand -base64 32>"
  openaiApiKey: "<your...ey>"
ingress:
  enabled: true
  className: nginx
  host: <hostname>
  tls:
    enabled: false
```

</details>

### 5. Install the chart

Install commands:

```bash
helm dependency build charts/hermeum
helm install hermeum ./charts/hermeum \
  -n hermeum --create-namespace \
  -f charts/hermeum/values-local.yaml \
  --wait --timeout 8m
```

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