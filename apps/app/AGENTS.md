# AGENTS.md

Notes for agents working in the `@hermeum/app` package.

## Commands

Run from the repo root via pnpm filter, or from this directory directly.

- **Typecheck:** `pnpm --filter @hermeum/app typecheck` (runs `tsc --noEmit`)
- **Lint:** `pnpm --filter @hermeum/app lint` (runs `eslint .`)
- **Tests (all):** `pnpm --filter @hermeum/app test` (runs `vitest run`)
- **Tests (single file):** `pnpm --filter @hermeum/app test -- <path>` (e.g. `... test -- src/server/usecases/chat.test.ts`)
- **Tests (watch):** `pnpm --filter @hermeum/app test:watch`
- **Dev server:** `pnpm --filter @hermeum/app dev`

## Conventions

- Use case classes compose mixins from `src/server/usecases/mixin.ts` (`BaseUseCase`, `HermeumConfigLoadable`, `OwnershipGuarded`) over injected `Runtime` (persistence) and `FileAdaptor` (docs) interfaces; concrete adaptors live in `src/server/infras/`. Inject mock adaptors in tests rather than relying on the defaults.
- Field semantics for the chat agent live in tool input-schema `.describe()` texts (Zod), not in the system prompt — see the header comment on `AGENT_CONFIG_CHAT_SYSTEM_PROMPT` in `src/server/usecases/chat.ts`.
- New chat tools follow the `readDocument` precedent: embed a lightweight list (names/ids + descriptions) in the system prompt up front via a `build*List()` method, and add a `read*` server-executed tool for fetching richer per-item detail on demand. Keep the prompt lean — batch lists into the prompt, batch detail calls into one tool invocation.
- Route-scoped components live in a `-components/` folder next to the consuming route (e.g. `routes/agents/$id/-components/`). The TanStack Router plugin's `routeFileIgnorePrefix` defaults to `-`, so `-`-prefixed folders are skipped during route generation and aren't picked up as routes. Promote a component back to `src/client/ui/components/` the moment a second consumer appears — otherwise route-local duplicates accumulate.