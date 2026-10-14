---
title: Database
description: SQLite vs Postgres, persistence, and migrations.
sidebar_label: Database
sidebar_position: 5
displayed_sidebar: docsSidebar
---

# Database

Hermeum supports two database backends: **SQLite** (the default, for single-instance
deployments) and **Postgres** (for scaling to multiple replicas). The only
hard-required env var is `HERMEUM_DATABASE_URL`.

## SQLite (default)

SQLite needs no external database server. Hermeum writes to a file on a persistent
volume.

```bash
HERMEUM_DATABASE_URL=file:/var/lib/hermeum/db.sqlite
```

Because the PVC is `ReadWriteOnce`, `replicaCount` must stay at `1` — you cannot scale
horizontally with SQLite.

## Postgres

Postgres lets you run multiple replicas and keeps the database outside the
cluster if you prefer. Set `HERMEUM_DATABASE_DIALECT=postgres` and point
`HERMEUM_DATABASE_URL` at your Postgres connection URL:

```bash
HERMEUM_DATABASE_DIALECT=postgres
HERMEUM_DATABASE_URL=postgres://user:pass@db.example.com:5432/hermeum
```

## Retention

The `agent_session_events` table (one row per ingested telemetry event) is kept
bounded by a scheduled cleanup job: sessions whose most recent event is older
than `HERMEUM_AGENT_SESSION_RETENTION_DAYS` (default `90`, `0` disables) are
deleted together with all of their events in a six-hour cycle. Sessions are
removed whole, so the session views never show partial histories. On Postgres,
replicas coordinate via an advisory lock so only one pod performs each cycle.

## Migrations

Hermeum ships per-dialect migration SQL under
`apps/app/src/server/migrations/{sqlite,postgres}` and applies them with
the bundled `drizzle-kit`. To run them yourself — for example from CI, a
one-off Job, or before pointing an existing database at a new Hermeum release —
set `HERMEUM_DATABASE_DIALECT` (so drizzle-kit picks the right config file) and
`HERMEUM_DATABASE_URL` (the connection it migrates against), then invoke the
Hermeum's `drizzle:migrate` script:

```bash
HERMEUM_DATABASE_DIALECT=postgres \
HERMEUM_DATABASE_URL=postgres://user:pass@db.example.com:5432/hermeum \
pnpm --filter @hermeum/app drizzle:migrate
```

The script resolves to
`drizzle-kit migrate --config drizzle.config.${HERMEUM_DATABASE_DIALECT:-sqlite}.ts`,
so `HERMEUM_DATABASE_DIALECT` selects `sqlite` or `postgres` and
`HERMEUM_DATABASE_URL` supplies the target. Migrations are idempotent, so
re-running against an already-current database is safe.

:::note
By default the Helm chart runs this same `drizzle-kit migrate` command as an
initContainer before Hermeum starts (`migrations.enabled`, default
`true`), so a standard `helm install`/`helm upgrade` needs no manual step. If
you run migrations out-of-band via the command above — or through a separate
Job or CI pipeline — disable the initContainer with
`migrations.enabled=false` so the two don't race.
:::
