# Hosting Plan: Hermeum Docs on Cloudflare

> **Goal:** Host the Docusaurus documentation on Cloudflare Pages under
> `docs.hermeum.app` now, then migrate it to `hermeum.app/docs/` once the
> website (TanStack Start SSR) is ready — keeping SEO credit on
> `hermeum.app`.

## Current status

| Item | Value |
| --- | --- |
| Docusaurus package | `apps/docs` (`@hermeum/docs`) |
| Current `url` | `https://hermeum.app` |
| Current `baseUrl` | `/docs/` |
| `routeBasePath` | `/` (content at `/docs/intro`, not `/docs/docs/intro`) |
| `trailingSlash` | `true` |
| Build output | `apps/docs/build/` |
| Website package | `apps/app` (TanStack Start — not yet deployed) |
| Monorepo tooling | pnpm workspaces + Turborepo |
| Existing Cloudflare config | None (no `wrangler.*`, `_headers`, or `_redirects` yet) |

## Why two phases

A `baseUrl` conflict makes proxying non-trivial:

- `baseUrl: "/"` works for `docs.hermeum.app` (root) but breaks internal
  links when proxied through `hermeum.app/docs/` (links resolve to
  `hermeum.app/using-hermeum/...`, missing the Worker's `/docs/*` match).
- `baseUrl: "/docs/"` works for the `hermeum.app/docs/` proxy but 404s on
  `docs.hermeum.app` (files live at root, not under `/docs/`).

The clean fix (used in Phase 2): serve the Docusaurus build **under a
`/docs/` subdirectory** on the Pages project so `/docs/` is `/docs/` on
both sides — no path rewriting, no response-body rewriting. The Worker
only swaps the hostname.

For now (Phase 1) there is no website, so we deploy docs standalone on
`docs.hermeum.app` with `baseUrl: "/"`.

---

## Phase 1 — Docs on `docs.hermeum.app` (now)

> Deploy Docusaurus as a standalone static site on Cloudflare Pages under
> `docs.hermeum.app`. No Worker, no website yet.

### 1.1 Create the Cloudflare Pages project

- **Project name:** `hermeum-docs`
- **Framework preset:** None (custom build)
- **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @hermeum/docs build`
- **Build output directory:** `apps/docs/build`
- **Root directory:** `/` (repo root, since it's a pnpm workspace)
- Connect the GitHub repo so Pages builds from `main` automatically.

### 1.2 Change Docusaurus config for `docs.hermeum.app`

File: `apps/docs/docusaurus.config.ts`

```diff
- url: "https://hermeum.app",
- baseUrl: "/docs/",
+ url: "https://docs.hermeum.app",
+ baseUrl: "/",
```

This makes:

- canonical links → `https://docs.hermeum.app/operation/installation/`
- `sitemap.xml` → `https://docs.hermeum.app/...`
- internal links → `/operation/installation/` (root-relative, correct for subdomain)
- asset links → `/assets/css/styles.css` (correct for subdomain root)

### 1.3 Add the custom domain in Cloudflare Pages

- In the Pages project settings, add custom domain: `docs.hermeum.app`.
- If `hermeum.app` is on the same Cloudflare account, the CNAME is
  created automatically. Otherwise add a CNAME: `docs` →
  `<project>.pages.dev`.

### 1.4 Add `_headers` for security

File: `apps/docs/static/_headers`

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

Docusaurus copies `static/` into the build output, so this lands at
`build/_headers` and Cloudflare Pages reads it automatically.

### 1.5 Trailing-slash consistency (no `_redirects` needed yet)

Docusaurus already emits trailing slashes (`trailingSlash: true`). Pages
serves both `/operation/installation` and `/operation/installation/`, so
no custom `_redirects` file is required for Phase 1.

### 1.6 Verify

- `pnpm --filter @hermeum/docs build` → inspect `apps/docs/build/`.
- Confirm canonical links point to `https://docs.hermeum.app/...`.
- Confirm `sitemap.xml` lists `docs.hermeum.app` URLs.
- Confirm internal links are root-relative (`/operation/installation/`).
- Push to `main` → Pages deploys → visit `https://docs.hermeum.app`.

---

## Phase 2 — Website on `hermeum.app` + migrate docs to `/docs/` (later)

> TanStack Start SSR website on `hermeum.app` via a Cloudflare Worker;
> docs proxied under `hermeum.app/docs/` with SEO credit staying on
> `hermeum.app`.

### 2.1 Scaffold `apps/website` (TanStack Start + Cloudflare Workers adapter)

- New workspace package: `apps/website`.
- TanStack Start with `@tanstack/start-cloudflare-workers` adapter.
- `wrangler.jsonc` for the Worker.
- Build output: `dist/` (Worker bundle + static assets).

### 2.2 Revert Docusaurus config back to `/docs/`

File: `apps/docs/docusaurus.config.ts`

```diff
- url: "https://docs.hermeum.app",
- baseUrl: "/",
+ url: "https://hermeum.app",
+ baseUrl: "/docs/",
```

Restores:

- canonical links → `https://hermeum.app/docs/operation/installation/`
- `sitemap.xml` → `https://hermeum.app/docs/...`
- internal links → `/docs/operation/installation/` (correct for proxy)

### 2.3 Serve Pages build under `/docs/`

Deploy the Docusaurus build output under a `/docs/` subdirectory so
`/docs/` is `/docs/` on both sides (proxy and direct). Update the Pages
build command with a post-build staging step:

```sh
pnpm --filter @hermeum/docs build \
  && rm -rf apps/docs/staged \
  && mkdir -p apps/docs/staged/docs \
  && cp -r apps/docs/build/* apps/docs/staged/docs/
```

- **Build output directory:** `apps/docs/staged`
- `docs.hermeum.app/docs/operation/installation/` serves correctly.
- Internal links `/docs/operation/installation/` resolve on
  `docs.hermeum.app` too.

> **Recommended:** remove the `docs.hermeum.app` custom domain once the
> Worker is live and use `<project>.pages.dev` as a private backend
> only. No public subdomain ⇒ no double-indexing risk, no `noindex`
> headers needed.

### 2.4 Worker routing logic

`wrangler.jsonc`:

```jsonc
{
  "name": "hermeum-website",
  "main": "dist/worker/index.js",
  "compatibility_date": "2025-01-01",
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS"
  }
}
```

Worker fetch handler (conceptual):

```ts
const url = new URL(request.url);

// Docs: proxy to Pages backend (hostname swap only — same path)
if (url.pathname.startsWith("/docs")) {
  const docsUrl = new URL(request.url);
  docsUrl.hostname = "hermeum-docs.pages.dev"; // or docs.hermeum.app
  return fetch(docsUrl.toString(), request);
}

// Everything else: TanStack Start SSR handler
return createHandler()(request);
```

### 2.5 Prevent double-indexing (only if keeping `docs.hermeum.app`)

If `docs.hermeum.app` stays public alongside `hermeum.app/docs/`, add to
`apps/docs/static/_headers`:

```
/*
  X-Robots-Tag: noindex, nofollow
```

And strip that header from the proxied response so `hermeum.app/docs/`
stays indexable:

```ts
if (url.pathname.startsWith("/docs")) {
  const docsUrl = new URL(request.url);
  docsUrl.hostname = "hermeum-docs.pages.dev";
  const res = await fetch(docsUrl.toString(), request);
  const headers = new Headers(res.headers);
  headers.delete("X-Robots-Tag");
  return new Response(res.body, { ...res, headers });
}
```

If you remove `docs.hermeum.app` (recommended), this is unnecessary —
the `pages.dev` URL won't be crawled.

### 2.6 Verify migration

- `hermeum.app/` → website SSR (TanStack Start).
- `hermeum.app/docs/` → docs content proxied from Pages.
- canonical links → `https://hermeum.app/docs/...` (SEO credit on `hermeum.app`).
- `sitemap.xml` → `https://hermeum.app/docs/...`.
- Internal links → `/docs/operation/installation/` (correct on `hermeum.app`).
- `docs.hermeum.app` → either removed or `noindex`.

---

## Summary of changes

### Phase 1 (now — docs only)

- `apps/docs/docusaurus.config.ts`: `url` → `docs.hermeum.app`,
  `baseUrl` → `"/"`.
- `apps/docs/static/_headers`: security headers.
- Cloudflare Pages project + custom domain `docs.hermeum.app`.
- No new app code, no Worker.

### Phase 2 (later — website + migration)

- `apps/website`: new TanStack Start workspace.
- `apps/docs/docusaurus.config.ts`: `url` → `hermeum.app`,
  `baseUrl` → `"/docs/"` (revert).
- Cloudflare Worker (`wrangler.jsonc` + Worker code).
- Pages project reconfigured to serve under `/docs/`.
- `_headers` `noindex` if keeping `docs.hermeum.app`.