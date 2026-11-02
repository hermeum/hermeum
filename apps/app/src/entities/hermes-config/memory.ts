import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/memory
// Full field semantics: docs/official/memory.md
//
// Hermeum-managed agents store memory in Hermeum and replace the native
// stores, so the memory policy is pinned: an explicit different value fails
// validation here, and the HermeumMemory managed aspect
// (server/usecases/agent.ts) injects the whole policy when the memory block is
// absent. `provider: hermeum` is additive upstream — external providers run
// alongside the built-in MEMORY.md/USER.md stores — so both built-in flags are
// pinned to false to complete the replacement.
//
// Skipped on purpose: memory_char_limit, user_char_limit, write_approval,
// nudge_interval, and prefetch_spill_enabled are not typed here — they pass
// through via looseObject.
export const MemorySchema = z
  .looseObject({
    provider: z
      .literal("hermeum")
      .optional()
      .describe(
        "Memory provider — fixed to 'hermeum'. Hermeum-managed agents store memory in Hermeum."
      ),
    memory_enabled: z
      .literal(false)
      .optional()
      .describe("Fixed to false: the built-in MEMORY.md store is replaced by the hermeum provider."),
    user_profile_enabled: z
      .literal(false)
      .optional()
      .describe("Fixed to false: there is no built-in USER.md store."),
  })
  .optional()
  .describe("Persistent memory. The provider and the built-in store flags are fixed by Hermeum.");

export type Memory = z.infer<typeof MemorySchema>;
