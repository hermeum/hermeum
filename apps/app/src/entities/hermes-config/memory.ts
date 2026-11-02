import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/memory
// Full field semantics: docs/official/memory.md
//
// Hermeum-managed agents store memory in Hermeum, so the provider is pinned:
// an explicit different provider fails validation here, and the HermeumMemory
// managed aspect (server/usecases/agent.ts) injects it when the memory block
// is absent.
//
// Skipped on purpose: memory_enabled, user_profile_enabled, memory_char_limit,
// user_char_limit, write_approval, nudge_interval, and prefetch_spill_enabled
// are not typed here — they pass through via looseObject. Hermeum enforces the
// provider only; everything else stays an operator choice.
export const MemorySchema = z
  .looseObject({
    provider: z
      .literal("hermeum")
      .optional()
      .describe(
        "Memory provider — fixed to 'hermeum'. Hermeum-managed agents store memory in Hermeum."
      ),
  })
  .optional()
  .describe("Persistent memory. The provider is fixed to Hermeum.");

export type Memory = z.infer<typeof MemorySchema>;
