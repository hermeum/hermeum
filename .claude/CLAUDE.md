# KubeBox Monorepo

## Repository Structure

This is a pnpm monorepo managed with Turborepo.

```
kubebox/
├── apps/
│   └── dashboard/        # Main web application (Next.js)
├── packages/
│   ├── entities/         # Shared domain entities
│   ├── eslint-config/    # Shared ESLint configuration
│   └── typescript-config/ # Shared TypeScript configuration
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## apps/dashboard — Clean Architecture

The server-side code in `apps/dashboard/src/server/` follows **clean architecture**:

```
src/server/
├── usecases/             # Application business logic (use cases)
│   └── adaptors/         # Interfaces/ports that use cases depend on
├── infras/               # Infrastructure implementations (DB, external APIs, etc.)
├── routers/              # tRPC routers — entry points that wire use cases together
├── trpc.ts               # tRPC instance and context setup
└── server.ts             # Server entry point
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
