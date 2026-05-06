---
name: wiki
description: Write and maintain project wiki documentation in the wiki/ directory. Covers contributing guides (wiki/contributing/) and user-facing docs (wiki/docs/). Use when asked to write, update, or organize project documentation.
user-invocable: true
---

# ClawAgent Wiki

The wiki lives at `wiki/` in the project root. There are two sections with distinct audiences and purposes:

```
wiki/
├── contributing/    # Internal guides for contributors
└── docs/            # User-facing guides for ClawAgent application
```

## Directory Purposes

### `wiki/contributing/`

Audience: developers contributing to the ClawAgent codebase.

Cover topics like:
- **Code architecture** — clean architecture layers 
- **Development setup** — pnpm monorepo, Turborepo, local environment setup
- **PR process** — branching, commit messages, review expectations

### `wiki/docs/`

Audience: end users and operators running ClawAgent in their Kubernetes cluster.

Cover topics like:
- **Getting started** — what ClawAgent is, prerequisites, installation
- **Configuration** — how to configure the dashboard, environment variables
- **Troubleshooting** — common issues and fixes

## Writing Guidelines

- Write in clear, direct prose. No filler phrases.
- Use headings, code blocks, and tables where they aid comprehension.
- Keep contributing docs grounded in the actual codebase — explore `apps/dashboard/src/` to understand the architecture and code structure.
- One topic per file. Name files with kebab-case (e.g., `adding-a-use-case.md`).
- Do not duplicate information across files — link between them instead.

## Workflow

1. Identify which section the content belongs to (`contributing/` or `docs/`).
2. Read relevant source files to ensure accuracy before writing.
3. Create or update the appropriate markdown file under `wiki/`.
4. If creating a new file, check if an index or table of contents file exists in the section and add a link.
