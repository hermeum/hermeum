# KubeClaw Monorepo

## Repository Structure

This is a pnpm monorepo managed with Turborepo.

```
kubeclaw/
├── apps/
│   └── dashboard/        # Main web application (Vite + React + TanStack Router)
├── packages/
│   ├── components/       # Shared Shadcn/ui components
│   ├── eslint-config/    # Shared ESLint configuration
│   └── typescript-config/ # Shared TypeScript configuration
├── testdata/
│   └── k8s/              # Kubernetes test fixtures
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## apps/dashboard — Architecture

The dashboard is a full-stack app with a client/server split:

```
src/
├── client/
│   ├── cmd/              # Client entry commands
│   └── routes/           # TanStack Router file-based routes
├── entities/             # Shared domain types (used by both client and server)
├── server/               # Server-side code (clean architecture)
│   ├── usecases/         # Application business logic (use cases)
│   │   └── adaptors/     # Interfaces/ports that use cases depend on
│   ├── infras/           # Infrastructure implementations
│   │   ├── kubernetes/   # Kubernetes API client and types
│   │   └── ...
│   ├── routers/          # tRPC routers — entry points that wire use cases together
├── main.tsx
└── router.tsx
```

### Layer responsibilities

- **`usecases/`** — Pure business logic. Each file represents a use case. Must not depend on infrastructure directly; depends only on adaptor interfaces defined in `usecases/adaptors/`.
- **`usecases/adaptors/`** — Port interfaces (TypeScript types/interfaces) that define what the use cases need from the outside world.
- **`infras/`** — Concrete implementations of the adaptor interfaces (e.g. database clients, Kubernetes API calls). Depends on `usecases/adaptors/`.
- **`routers/`** — tRPC routers. Thin layer that receives requests, calls use cases, and returns responses. Wires infra implementations into use cases via dependency injection.

### Dependency rule

```
routers -> usecases ->  adaptors (interfaces) <- infras
              |
              V
           entities
```

Outer layers depend on inner layers. Use cases never import from `infras/` or `routers/`.
