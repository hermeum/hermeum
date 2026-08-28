# AGENTS.md

Notes for agents working in the Hermeum monorepo.

## Repository Layout

pnpm + Turbo monorepo (Node >=20, pnpm >=9). Workspaces are declared in `pnpm-workspace.yaml` and orchestrated by Turbo (`turbo.json`).

- `apps/app` — `@hermeum/app`, the main application (TanStack Router + Vinxi server).
- `apps/docs` — `@hermeum/docs`, the Docusaurus documentation site.
- `packages/components` — `@hermeum/components`, shared shadcn-based UI components.
- `packages/eslint-config` — shared ESLint flat configs (`base.js`, `react.js`).
- `packages/typescript-config` — shared TSConfig presets (`base.json`, `bundler-app.json`, `library.json`, `react-library.json`).
- `charts/` — Helm chart for deployment.
- `docs/cloudflare-hosting` — Cloudflare hosting notes.

Run tasks from the repo root via Turbo, or from a package directory via pnpm filter:

- **Build (all):** `pnpm build` (Turbo, depends on `^build`)
- **Typecheck (all):** `pnpm typecheck`
- **Lint (all):** `pnpm lint`
- **Tests (all):** `pnpm test`
- **Dev (all):** `pnpm dev`
- **Format:** `pnpm format` / `pnpm format:check`
- **Clean:** `pnpm clean`

TypeScript is strict (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`); target ES2022 with `moduleResolution: Bundler`.

## `@hermeum/app` (`apps/app`)

### Commands

Run from the repo root via pnpm filter, or from this directory directly.

- **Typecheck:** `pnpm --filter @hermeum/app typecheck` (runs `tsc --noEmit`)
- **Lint:** `pnpm --filter @hermeum/app lint` (runs `eslint .`)
- **Tests (all):** `pnpm --filter @hermeum/app test` (runs `vitest run`)
- **Tests (single file):** `pnpm --filter @hermeum/app test -- <path>` (e.g. `... test -- src/server/usecases/chat.test.ts`)
- **Tests (watch):** `pnpm --filter @hermeum/app test:watch`
- **Dev server:** `pnpm --filter @hermeum/app dev`

### Conventions

- It follows clean architecture. Entities and use cases must not depend on any infrastructure or framework — dependencies point inward toward the domain. Drawing the dependency graph: `frameworks/drivers → interface adapters → use cases → entities`, with each layer only depending on the layer(s) to its left. Inject infrastructures (persistence, file adaptors, etc.) behind interfaces (`Runtime`, `FileAdaptor`) at the use-case boundary rather than importing concrete adaptors directly.

- `src/entities/hermes-config/` (Zod schemas) and `docs/hermes-config/` (field-semantics docs) track the pinned hermes-agent version in the `vendor/hermes-agent` submodule. When the default version changes, verify against the official docs in the submodule and update both the schemas and the docs in lockstep — each schema file's header links the upstream page it mirrors.
- `src/entities/hermes-config/` extracts only the core fields from the official documents — not every field.
- `docs/hermes-config/` extracts only the information Hermeum needs: description, configuration, env vars, and the like.
- Field semantics for the chat agent live in tool input-schema `.describe()` texts (Zod), not in the system prompt — see the header comment on `AGENT_CONFIG_CHAT_SYSTEM_PROMPT` in `src/server/usecases/chat.ts`.
- New chat tools follow the `readDocument` precedent: embed a lightweight list (names/ids + descriptions) in the system prompt up front via a `build*List()` method, and add a `read*` server-executed tool for fetching richer per-item detail on demand. Keep the prompt lean — batch lists into the prompt, batch detail calls into one tool invocation.
- Route-scoped components live in a `-components/` folder next to the consuming route (e.g. `routes/agents/$id/-components/`). The TanStack Router plugin's `routeFileIgnorePrefix` defaults to `-`, so `-`-prefixed folders are skipped during route generation and aren't picked up as routes. Promote a component back to `src/client/ui/components/` the moment a second consumer appears — otherwise route-local duplicates accumulate.

## `@hermeum/docs` (`apps/docs`)

### Commands

Run from the repo root via pnpm filter, or from this directory directly.

- **Typecheck:** `pnpm --filter @hermeum/docs typecheck` (runs `tsc --noEmit`)
- **Build:** `pnpm --filter @hermeum/docs build` (emits static site to `build/`)
- **Dev server:** `pnpm --filter @hermeum/docs dev` (serves at `http://localhost:3001`)
- **Serve prod build:** `pnpm --filter @hermeum/docs serve`
- **Clean:** `pnpm --filter @hermeum/docs clean`

### Conventions

- Docs live at the `/docs/` subpath (`baseUrl: '/docs/'`); the docs plugin uses `routeBasePath: '/'` so content is at `/docs/intro` (not `/docs/docs/intro`).
- **Do not add `"type": "module"` to `package.json`** — it breaks Docusaurus v3.10's SSG (`require.resolveWeak` error).
- Config is typed: `docusaurus.config.ts` uses `satisfies Config`, `sidebars.ts` uses `SidebarsConfig`.
- Pages live under `src/pages/`; documentation under `docs/`. New docs are added as `*.md`/`*.mdx` and surfaced via `sidebars.ts`.
- Docusaurus emits to `build/` (not `dist/`); `turbo.json`'s `build.outputs` includes `build/**`.
- Blog plugin is disabled (`blog: false`); `future.v4: true` enables Rspack via `@docusaurus/faster`.
- Operation docs (`docs/operation/*.md`) explain configuration in terms of `HERMEUM_*` environment variables, not Helm chart value keys. The Helm chart is documented separately in the chart's `values.yaml`; operation pages should stay chart-agnostic. The sole exception is `installation.md`, which bridges the two by showing `helm install` commands alongside the env vars they set. Chart-specific behavior that has no env-var surface (e.g. `migrations.enabled`, `persistence.*`, `operator.enabled`, `ingress.*`) may still be mentioned in a `:::note` or a dedicated subsection, but the primary explanation must be env-var-first.

