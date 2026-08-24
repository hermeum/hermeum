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

## Migrations

Database migrations run automatically as an initContainer before the hermeum starts
(`migrations.enabled`, default `true`). They use the bundled `drizzle-kit` with
per-dialect SQL — no manual steps required.

If you prefer to run migrations out-of-band (for example, in a separate Job or CI
pipeline), disable them with `migrations.enabled=false`.