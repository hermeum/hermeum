# AGENTS.md

Notes for agents working in the `@hermeum/docs` package.

## Commands

Run from the repo root via pnpm filter, or from this directory directly.

- **Typecheck:** `pnpm --filter @hermeum/docs typecheck` (runs `tsc --noEmit`)
- **Build:** `pnpm --filter @hermeum/docs build` (emits static site to `build/`)
- **Dev server:** `pnpm --filter @hermeum/docs dev` (serves at `http://localhost:3001`)
- **Serve prod build:** `pnpm --filter @hermeum/docs serve`
- **Clean:** `pnpm --filter @hermeum/docs clean`

## Conventions

- Docs live at the `/docs/` subpath (`baseUrl: '/docs/'`); the docs plugin uses `routeBasePath: '/'` so content is at `/docs/intro` (not `/docs/docs/intro`).
- **Do not add `"type": "module"` to `package.json`** — it breaks Docusaurus v3.10's SSG (`require.resolveWeak` error).
- Config is typed: `docusaurus.config.ts` uses `satisfies Config`, `sidebars.ts` uses `SidebarsConfig`.
- Pages live under `src/pages/`; documentation under `docs/`. New docs are added as `*.md`/`*.mdx` and surfaced via `sidebars.ts`.
- Docusaurus emits to `build/` (not `dist/`); `turbo.json`'s `build.outputs` includes `build/**`.
- Blog plugin is disabled (`blog: false`); `future.v4: true` enables Rspack via `@docusaurus/faster`.
- Operation docs (`docs/operation/*.md`) explain configuration in terms of `HERMEUM_*` environment variables, not Helm chart value keys. The Helm chart is documented separately in the chart's `values.yaml`; operation pages should stay chart-agnostic. The sole exception is `installation.md`, which bridges the two by showing `helm install` commands alongside the env vars they set. Chart-specific behavior that has no env-var surface (e.g. `migrations.enabled`, `persistence.*`, `operator.enabled`, `ingress.*`) may still be mentioned in a `:::note` or a dedicated subsection, but the primary explanation must be env-var-first.