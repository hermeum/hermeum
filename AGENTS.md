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

## PR and commit titles

Use Conventional Commits format: `<type>(<scope>): <description>` (lowercase, imperative, no trailing period). Scopes match the workspace or area touched (`app`, `docs`, `ui`, `chart`, `ci`, `docker`); omit the scope for repo-wide changes. Common types: `feat`, `fix`, `refactor`, `docs`, `chore`, `ci`. PR titles follow the same format — squash merges prepend them to the commit log.

## Version upgrades

When upgrading the Hermeum app version, update every place that mirrors it, in lockstep:

- `apps/app/package.json` — `version`
- `apps/docs/package.json` — `version`
- `packages/components/package.json` — `version`
- `packages/typescript-config/package.json` — `version`
- `charts/hermeum/Chart.yaml` — `appVersion` (the app release version). The chart `version` is the packaging version and is independent of `appVersion`; bump its patch version whenever the chart is republished for the upgrade.

The chart `image.tag` (`charts/hermeum/values.yaml`) defaults to `appVersion` when empty — leave it empty unless pinning to a non-`appVersion` tag.

### Upgrading the hermes-agent image tag

When upgrading `hermesImageTag` (the pinned hermes-agent release), update every place that mirrors it, in lockstep:

- `vendor/hermes-agent` — check out the new release tag in the submodule.
- `charts/hermeum/values.yaml` — `config.hermesImageTag`.
- `apps/app/src/server/libs/config.ts` — the `hermesImageTag` Zod default.
- `apps/docs/docs/operation/configuration-reference.md` — the `HERMEUM_HERMES_IMAGE_TAG` default.
- `charts/hermeum/Chart.yaml` — bump the chart `version` patch (the chart is republished for the upgrade; `appVersion` tracks the Hermeum app release, not the agent image, and stays untouched).

Then sync `apps/app/src/entities/hermes-config/` (Zod schemas) and `apps/app/docs/hermes-config/` (field-semantics docs) against the official docs at the new submodule pin. Both directories always reflect the pinned submodule version — never mention the version string in their comments or prose; the submodule pointer implies it.

**Apply the standing Hermeum policy deltas instead of re-deciding them per upgrade.** When an upstream change touches one of these, keep Hermeum's behavior and record the omission in a header comment on the schema file ("Skipped on purpose: …") and/or an upstream-differs `:::note` in the doc — do not adopt the upstream shape:

- **OAuth-gated providers are omitted.** `nous` (the managed Tool Gateway) is not surfaced anywhere — `web.backend`, `browser.cloud_provider`, `image_gen.provider` — because Nous Portal OAuth is not supported in container mode. Values still pass through via `looseObject` if hand-written.
- **Credentials stay env-only.** Never document or type secret-bearing fields in `config.yaml` (e.g. Teams `client_id`/`client_secret`/`tenant_id`, API server `key`, webhook route `secret`) even when upstream accepts them in config; pair the config-path enablement with a `superRefine` requirement for the `sensitive: true` env var.
- **Operator-level concerns are not exposed via agent configuration.** Webhook route `filters`/`script`/`toolsets` are not typed — they pass through unvalidated.
- **Behavior pinned by Hermeum policy stays pinned.** e.g. Slack `unauthorized_dm_behavior` stays literal `"ignore"` (deny-by-default) rather than upstream's `"pair"` default; `browser.cloud_provider: local` is surfaced.
- **Env-vs-config precedence is per platform, taken from the upstream doc** — don't assume one direction: api-server env vars win over config; webhook/teams config wins over env vars. Verify per platform and state the direction in the doc.

Fields not worth validating are left out of the schemas (they pass through via `looseObject`) but must still be reflected in the docs when they change semantics — the docs track upstream, the schemas track only what Hermeum needs to enforce.

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

