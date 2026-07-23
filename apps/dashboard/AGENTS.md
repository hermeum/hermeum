# AGENTS.md

Notes for agents working in the `@hermeum/dashboard` package.

## Commands

Run from the repo root via pnpm filter, or from this directory directly.

- **Typecheck:** `pnpm --filter @hermeum/dashboard typecheck` (runs `tsc --noEmit`)
- **Lint:** `pnpm --filter @hermeum/dashboard lint` (runs `eslint .`)
- **Tests (all):** `pnpm --filter @hermeum/dashboard test` (runs `vitest run`)
- **Tests (single file):** `pnpm --filter @hermeum/dashboard test -- <path>` (e.g. `... test -- src/server/usecases/chat.test.ts`)
- **Tests (watch):** `pnpm --filter @hermeum/dashboard test:watch`
- **Dev server:** `pnpm --filter @hermeum/dashboard dev`

## Conventions

- Use case classes compose mixins from `src/server/usecases/mixin.ts` (`BaseUseCase`, `HermeumConfigLoadable`, `OwnershipGuarded`) over injected `Runtime` (persistence) and `FileAdaptor` (docs) interfaces; concrete adaptors live in `src/server/infras/`. Inject mock adaptors in tests rather than relying on the defaults.
- Field semantics for the chat agent live in tool input-schema `.describe()` texts (Zod), not in the system prompt — see the header comment on `AGENT_CONFIG_CHAT_SYSTEM_PROMPT` in `src/server/usecases/chat.ts`.
- New chat tools follow the `readDocument` precedent: embed a lightweight list (names/ids + descriptions) in the system prompt up front via a `build*List()` method, and add a `read*` server-executed tool for fetching richer per-item detail on demand. Keep the prompt lean — batch lists into the prompt, batch detail calls into one tool invocation.