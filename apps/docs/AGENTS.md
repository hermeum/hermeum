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

- Docs live at the site root (`baseUrl: '/'`); no subpath. Docs content is served at `/docs/` (default `routeBasePath`).
- **Do not add `"type": "module"` to `package.json`** — it breaks Docusaurus v3.10's SSG (`require.resolveWeak` error).
- Config is typed: `docusaurus.config.ts` uses `satisfies Config`, `sidebars.ts` uses `SidebarsConfig`.
- Pages live under `src/pages/`; documentation under `docs/`. New docs are added as `*.md`/`*.mdx` and surfaced via `sidebars.ts`.
- Docusaurus emits to `build/` (not `dist/`); `turbo.json`'s `build.outputs` includes `build/**`.
- Blog plugin is disabled (`blog: false`); `future.v4: true` enables Rspack via `@docusaurus/faster`.